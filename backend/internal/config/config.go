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

	// 默认设置
	c.Server.Port = 8080
	c.Server.Mode = "debug"
	c.Database.Host = "localhost"
	c.Database.Port = 5436
	c.Database.SSLMode = "disable"

	// 尝试从文件读取
	data, err := os.ReadFile("config.yaml")
	if err == nil {
		_ = yaml.Unmarshal(data, c)
	}

	// 环境变量覆盖端口
	if envPort := os.Getenv("SERVER_PORT"); envPort != "" {
		fmt.Sscanf(envPort, "%d", &c.Server.Port)
	}

	log.Printf("[Config] Server config loaded. Mode: %s, Port: %d", c.Server.Mode, c.Server.Port)
	return c
}
