package config

import (
	"fmt"
	"log"
	"os"

	"github.com/goccy/go-yaml"
)

type Config struct {
	Database struct {
		User     string `yaml:"user"`
		Password string `yaml:"password"`
		Name     string `yaml:"name"`
		Host     string `yaml:"host"`
		Port     int    `yaml:"port"`
		SSLMode  string `yaml:"ssl_mode"`
		TimeZone string `yaml:"timezone"`
	} `yaml:"database"`
	Server struct {
		Port      int    `yaml:"port"`
		Mode      string `yaml:"mode"`
		JWTSecret string `yaml:"jwt_secret"`
		UploadDir string `yaml:"upload_dir"`
	} `yaml:"server"`
}

func (c *Config) GetDatabaseDSN() string {
	// 优先从环境变量读取（容器环境常用）
	// 注意：这里为了兼容 deployer 传参，检查 DATABASE_DSN 或更通用的 DATABASE_URL
	dsn := os.Getenv("DATABASE_DSN")
	if dsn == "" {
		dsn = os.Getenv("DATABASE_URL")
	}

	if dsn != "" {
		return dsn
	}
	return fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%d sslmode=%s TimeZone=%s",
		c.Database.Host, c.Database.User, c.Database.Password, c.Database.Name, c.Database.Port, c.Database.SSLMode, c.Database.TimeZone)
}

func LoadConfig() *Config {
	c := &Config{}

	// 1. 默认设置
	c.Server.Port = 8080
	c.Server.Mode = "debug"
	c.Database.Host = "localhost"
	c.Database.Port = 5436
	c.Database.SSLMode = "disable"
	c.Database.TimeZone = "Asia/Shanghai"

	// 2. 确定当前环境
	env := os.Getenv("APP_ENV")
	if env == "" {
		env = "dev"
	}

	// 3. 构建候选配置文件路径列表（按优先级排序）
	// 支持在 root 或 backend/ 目录下运行，并优先环境特定配置
	candidates := []string{
		fmt.Sprintf("./config.%s.yaml", env),
		fmt.Sprintf("../config.%s.yaml", env),
		"./config.yaml",
		"../config.yaml",
	}

	// 4. 按顺序尝试加载
	var loaded bool
	for _, path := range candidates {
		data, err := os.ReadFile(path)
		if err == nil {
			if err := yaml.Unmarshal(data, c); err == nil {
				log.Printf("[Config] Loaded config from: %s", path)
				loaded = true
				break
			}
		}
	}

	if !loaded {
		log.Println("[Config] No config file found, using defaults and environment variables.")
	}

	// 5. 环境变量覆盖
	if envPort := os.Getenv("SERVER_PORT"); envPort != "" {
		fmt.Sscanf(envPort, "%d", &c.Server.Port)
	}
	if host := os.Getenv("DB_HOST"); host != "" {
		c.Database.Host = host
	}
	if user := os.Getenv("DB_USER"); user != "" {
		c.Database.User = user
	}
	if pwd := os.Getenv("DB_PASSWORD"); pwd != "" {
		c.Database.Password = pwd
	}
	if name := os.Getenv("DB_NAME"); name != "" {
		c.Database.Name = name
	}
	if port := os.Getenv("DB_PORT"); port != "" {
		fmt.Sscanf(port, "%d", &c.Database.Port)
	}

	log.Printf("[Config] Server config initialized. Env: %s, Mode: %s, Port: %d", env, c.Server.Mode, c.Server.Port)
	return c
}
