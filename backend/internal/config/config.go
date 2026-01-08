package config

import (
	"os"
)

type Config struct {
	DatabaseDSN string
	ServerPort  string
}

func LoadConfig() *Config {
	dsn := os.Getenv("DATABASE_DSN")
	if dsn == "" {
		dsn = "host=localhost user=postgres password=123456 dbname=csv_cleaner port=5436 sslmode=disable TimeZone=Asia/Shanghai"
	}

	port := os.Getenv("SERVER_PORT")
	if port == "" {
		port = "8080"
	}

	return &Config{
		DatabaseDSN: dsn,
		ServerPort:  port,
	}
}
