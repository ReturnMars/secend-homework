package main

import (
	"compress/gzip"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/goccy/go-yaml"
	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
)

// Config 结构体，用于解析 config.yaml
type Config struct {
	Database struct {
		Password           string `yaml:"password"`
		SharedBuffers      string `yaml:"shared_buffers"`
		WorkMem            string `yaml:"work_mem"`
		MaintenanceWorkMem string `yaml:"maintenance_work_mem"`
		EffectiveCacheSize string `yaml:"effective_cache_size"`
		MaxConnections     int    `yaml:"max_connections"`
	} `yaml:"database"`
	Frontend struct {
		APIBaseURL   string `yaml:"api_base_url"`
		ExternalPort int    `yaml:"external_port"`
	} `yaml:"frontend"`
	Deploy struct {
		RemoteHost     string `yaml:"remote_host"`
		RemoteUser     string `yaml:"remote_user"`
		SSHKeyPath     string `yaml:"ssh_key_path"`
		RemotePassword string `yaml:"remote_password"`
		DeployPath     string `yaml:"deploy_path"`
		Limits         struct {
			MemoryDB       string `yaml:"memory_db"`
			MemoryBackend  string `yaml:"memory_backend"`
			MemoryFrontend string `yaml:"memory_frontend"`
		} `yaml:"limits"`
	} `yaml:"deploy"`
}

func main() {
	fmt.Println("🚀 ETL Tool Deployment Tool Starting...")

	// 1. 加载配置
	cfg := loadConfig()
	fmt.Printf("📍 Target: %s@%s\n", cfg.Deploy.RemoteUser, cfg.Deploy.RemoteHost)

	// 2. 本端构建
	buildFrontend(cfg)
	buildBackend()

	// 3. Docker 镜像准备
	prepareImages()

	// 4. 打包镜像
	frontendTar := "etl-tool-frontend.tar.gz"
	backendTar := "etl-tool-backend.tar.gz"
	dbTar := "etl-tool-db.tar.gz"
	saveAndCompressImage("etl-tool-frontend:latest", frontendTar)
	saveAndCompressImage("etl-tool-backend:latest", backendTar)
	saveAndCompressImage("postgres:17-alpine", dbTar)

	// 5. 建立 SSH 连接
	sshClient := connectSSH(cfg)
	defer sshClient.Close()

	// 6. 创建远程目录
	runRemoteCommand(sshClient, fmt.Sprintf("mkdir -p %s", cfg.Deploy.DeployPath))

	// 7. SFTP 上传
	uploadFiles(sshClient, cfg.Deploy.DeployPath, []string{
		frontendTar,
		backendTar,
		dbTar,
		"infra/docker-compose.prod.yml",
		"config.prod.yaml",
	})

	// 8. 远程解包并部署
	fmt.Println("🏗️  Remote Loading and Deployment...")

	// 构建环境变量字符串
	envVars := fmt.Sprintf(
		"DB_PASSWORD=%s FRONTEND_PORT=%d "+
			"DB_MEMORY=%s BACKEND_MEMORY=%s FRONTEND_MEMORY=%s "+
			"PG_SHARED_BUFFERS=%s PG_WORK_MEM=%s PG_MAINT_WORK_MEM=%s "+
			"PG_CACHE_SIZE=%s PG_MAX_CONN=%d",
		cfg.Database.Password, cfg.Frontend.ExternalPort,
		getOrDefault(cfg.Deploy.Limits.MemoryDB, "512M"),
		getOrDefault(cfg.Deploy.Limits.MemoryBackend, "1G"),
		getOrDefault(cfg.Deploy.Limits.MemoryFrontend, "128M"),
		getOrDefault(cfg.Database.SharedBuffers, "128MB"),
		getOrDefault(cfg.Database.WorkMem, "8MB"),
		getOrDefault(cfg.Database.MaintenanceWorkMem, "64MB"),
		getOrDefault(cfg.Database.EffectiveCacheSize, "256MB"),
		getIntOrDefault(cfg.Database.MaxConnections, 50),
	)

	commands := []string{
		fmt.Sprintf("cd %s && docker load -i %s", cfg.Deploy.DeployPath, frontendTar),
		fmt.Sprintf("cd %s && docker load -i %s", cfg.Deploy.DeployPath, backendTar),
		fmt.Sprintf("cd %s && docker load -i %s", cfg.Deploy.DeployPath, dbTar),
		fmt.Sprintf("cd %s && %s docker compose -f docker-compose.prod.yml up -d --remove-orphans", cfg.Deploy.DeployPath, envVars),
		"docker system prune -f",
	}
	for _, cmd := range commands {
		runRemoteCommand(sshClient, cmd)
	}

	// 9. 状态检查与日志输出 (诊断 502 必备)
	fmt.Println("\n🔍 Checking service health and logs...")
	time.Sleep(5 * time.Second) // 增加到 5 秒，给 DB 启动留出时间

	diagCommands := []string{
		fmt.Sprintf("cd %s && docker compose -f docker-compose.prod.yml ps", cfg.Deploy.DeployPath),
		fmt.Sprintf("cd %s && docker compose -f docker-compose.prod.yml logs --tail 50 backend", cfg.Deploy.DeployPath),
	}
	for _, cmd := range diagCommands {
		runRemoteCommand(sshClient, cmd)
	}

	fmt.Println("\n✨ Deployment Completed Successfully!")
}

func loadConfig() *Config {
	data, err := os.ReadFile("../config.prod.yaml")
	if err != nil {
		log.Fatalf("❌ Failed to read config.prod.yaml: %v", err)
	}
	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		log.Fatalf("❌ Failed to parse config.yaml: %v", err)
	}
	return &cfg
}

func buildFrontend(cfg *Config) {
	fmt.Println("📦 Building Frontend...")
	cmd := exec.Command("pnpm", "build")
	cmd.Dir = "../frontend"
	// 注入生产环境 API 地址，如果 config.yaml 里是 /api，则打包后会使用相对路径
	cmd.Env = append(os.Environ(), "VITE_API_BASE_URL="+cfg.Frontend.APIBaseURL)
	runCommand(cmd)
}

func buildBackend() {
	fmt.Println("🐹 Building Backend (Linux Amd64)...")
	output := filepath.Join("..", "backend", "main-linux")
	cmd := exec.Command("go", "build", "-o", output, "./cmd/server")
	cmd.Dir = "../backend"
	cmd.Env = append(os.Environ(), "CGO_ENABLED=0", "GOOS=linux", "GOARCH=amd64")
	runCommand(cmd)
}

func prepareImages() {
	fmt.Println("🐳 Building Docker Images...")

	// 检测代理配置（Clash Verge 默认端口 7897）
	proxy := os.Getenv("HTTP_PROXY")
	if proxy == "" {
		proxy = "http://host.docker.internal:7897"
	}

	// Frontend Image (nginx 不需要代理)
	runCommand(exec.Command("docker", "build", "-t", "etl-tool-frontend:latest", "-f", "../infra/Dockerfile.frontend", ".."))

	// Backend Image (需要代理来安装 apk 包)
	runCommand(exec.Command("docker", "build",
		"--build-arg", "HTTP_PROXY="+proxy,
		"--build-arg", "HTTPS_PROXY="+proxy,
		"-t", "etl-tool-backend:latest",
		"-f", "../infra/Dockerfile.backend", ".."))
}

func saveAndCompressImage(imageTag, outputFile string) {
	fmt.Printf("📦 Exporting and Compressing %s...\n", imageTag)
	saveCmd := exec.Command("docker", "save", imageTag)

	f, err := os.Create(outputFile)
	if err != nil {
		log.Fatalf("❌ Failed to create %s: %v", outputFile, err)
	}
	defer f.Close()

	gw := gzip.NewWriter(f)
	defer gw.Close()

	saveCmd.Stdout = gw
	if err := saveCmd.Run(); err != nil {
		log.Fatalf("❌ Failed to save docker image %s: %v", imageTag, err)
	}
}

func connectSSH(cfg *Config) *ssh.Client {
	fmt.Println("🔐 Connecting to Server...")

	var auth []ssh.AuthMethod

	if cfg.Deploy.RemotePassword != "" {
		// 优先使用密码认证
		auth = append(auth, ssh.Password(cfg.Deploy.RemotePassword))
	} else {
		// 使用 SSH Key 认证
		keyPath := cfg.Deploy.SSHKeyPath
		if strings.HasPrefix(keyPath, "~/") {
			home, _ := os.UserHomeDir()
			keyPath = filepath.Join(home, keyPath[2:])
		}

		key, err := os.ReadFile(keyPath)
		if err != nil {
			log.Fatalf("❌ Unable to read private key: %v", err)
		}

		signer, err := ssh.ParsePrivateKey(key)
		if err != nil {
			log.Fatalf("❌ Unable to parse private key: %v", err)
		}
		auth = append(auth, ssh.PublicKeys(signer))
	}

	sshConfig := &ssh.ClientConfig{
		User:            cfg.Deploy.RemoteUser,
		Auth:            auth,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         30 * time.Second,
	}

	client, err := ssh.Dial("tcp", fmt.Sprintf("%s:22", cfg.Deploy.RemoteHost), sshConfig)
	if err != nil {
		log.Fatalf("❌ Failed to dial: %v", err)
	}
	return client
}

func uploadFiles(sshClient *ssh.Client, remotePath string, files []string) {
	fmt.Println("📤 Uploading Files via SFTP...")
	sftpClient, err := sftp.NewClient(sshClient)
	if err != nil {
		log.Fatalf("❌ Failed to create SFTP client: %v", err)
	}
	defer sftpClient.Close()

	for _, file := range files {
		localFile := file
		// 处理不在当前目录的任务文件路径
		if strings.Contains(file, "/") || strings.HasPrefix(file, "config") {
			localFile = filepath.Join("..", file)
		}

		fmt.Printf("   -> %s\n", file)
		srcFile, err := os.Open(localFile)
		if err != nil {
			log.Fatalf("❌ Failed to open local file %s: %v", localFile, err)
		}
		defer srcFile.Close()

		dstPath := filepath.Join(remotePath, filepath.Base(file))
		// 在 Linux 服务器上，强制使用正斜杠
		if runtime.GOOS == "windows" {
			dstPath = strings.ReplaceAll(dstPath, "\\", "/")
		}

		dstFile, err := sftpClient.Create(dstPath)
		if err != nil {
			log.Fatalf("❌ Failed to create remote file %s: %v", dstPath, err)
		}
		defer dstFile.Close()

		if _, err := io.Copy(dstFile, srcFile); err != nil {
			log.Fatalf("❌ Failed to upload %s: %v", file, err)
		}
	}
}

func runRemoteCommand(client *ssh.Client, cmd string) {
	session, err := client.NewSession()
	if err != nil {
		log.Fatalf("❌ Failed to create session: %v", err)
	}
	defer session.Close()

	fmt.Printf("💻 Executing: %s\n", cmd)
	session.Stdout = os.Stdout
	session.Stderr = os.Stderr
	if err := session.Run(cmd); err != nil {
		log.Fatalf("❌ Command failed: %s, Error: %v", cmd, err)
	}
}

func runCommand(cmd *exec.Cmd) {
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		log.Fatalf("❌ Execution failed: %v", err)
	}
}

// getOrDefault 返回字符串值，如果为空则返回默认值
func getOrDefault(val, defaultVal string) string {
	if val == "" {
		return defaultVal
	}
	return val
}

// getIntOrDefault 返回整数值，如果为 0 则返回默认值
func getIntOrDefault(val, defaultVal int) int {
	if val == 0 {
		return defaultVal
	}
	return val
}
