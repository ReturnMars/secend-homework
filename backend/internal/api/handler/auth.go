package handler

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"os"
	"time"

	"etl-tool/internal/model"
	"etl-tool/internal/utils"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"
)

// JWT secret key (in production, use environment variable)
var jwtSecret = []byte(getJWTSecret())

func getJWTSecret() string {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		// Default secret for development (NOT for production!)
		secret = "cisdi-csv-cleaner-jwt-secret-2026"
	}
	return secret
}

// JWT Claims
type Claims struct {
	Username string `json:"username"`
	jwt.RegisteredClaims
}

// AuthHandler handles authentication
type AuthHandler struct {
	db *gorm.DB
}

func NewAuthHandler(db *gorm.DB) *AuthHandler {
	h := &AuthHandler{
		db: db,
	}

	// Seed admin user if not exists
	h.seedAdminUser()

	return h
}

// seedAdminUser creates the default admin user if it doesn't exist
func (h *AuthHandler) seedAdminUser() {
	var count int64
	h.db.Model(&model.User{}).Where("username = ?", "admin").Count(&count)
	if count == 0 {
		user := model.User{
			Username:     "admin",
			PasswordHash: hashPassword("admin123"),
			CreatedAt:    time.Now(),
		}
		h.db.Create(&user)
		fmt.Println("[Auth] Created default admin user")
	}
}

// hashPassword creates a SHA256 hash of the password
// Note: In production, use bcrypt instead!
func hashPassword(password string) string {
	hash := sha256.Sum256([]byte(password))
	return hex.EncodeToString(hash[:])
}

// GenerateToken creates a new JWT token for a user
// GenerateToken creates a new JWT token for a user with default 24h expiration
func (h *AuthHandler) GenerateToken(username string) (string, error) {
	return h.GenerateTokenWithDuration(username, 24*time.Hour)
}

// GenerateTokenWithDuration creates a JWT token with specific duration
func (h *AuthHandler) GenerateTokenWithDuration(username string, duration time.Duration) (string, error) {
	expirationTime := time.Now().Add(duration)

	claims := &Claims{
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expirationTime),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "csv-cleaner",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtSecret)
}

// GetDownloadToken returns a short-lived token (1 minute) for file downloads
func (h *AuthHandler) GetDownloadToken(c *gin.Context) {
	username := c.GetString("username")
	if username == "" {
		utils.ErrorResponse(c, http.StatusUnauthorized, "User context missing")
		return
	}

	// 1 Minute Expiration
	token, err := h.GenerateTokenWithDuration(username, 1*time.Minute)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to generate download token")
		return
	}

	utils.SuccessResponse(c, gin.H{
		"token": token,
	})
}

// VerifyToken checks if a token is valid and returns the username
func (h *AuthHandler) VerifyToken(tokenString string) (string, bool) {
	claims := &Claims{}

	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
		// Validate signing method
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return jwtSecret, nil
	})

	if err != nil {
		fmt.Printf("[Auth] Token verification failed: %v\n", err)
		return "", false
	}

	if !token.Valid {
		return "", false
	}

	return claims.Username, true
}

// Login handles user login
func (h *AuthHandler) Login(c *gin.Context) {
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request format"})
		return
	}

	fmt.Printf("[Auth] Login attempt: User=%s\n", req.Username)

	// Check against database
	var user model.User
	if err := h.db.Where("username = ?", req.Username).First(&user).Error; err != nil {
		fmt.Printf("[Auth] Login failed: user not found %s\n", req.Username)
		utils.ErrorResponse(c, http.StatusUnauthorized, "Invalid username or password")
		return
	}

	// Compare password hash
	if user.PasswordHash != hashPassword(req.Password) {
		fmt.Printf("[Auth] Login failed: wrong password for %s\n", req.Username)
		utils.ErrorResponse(c, http.StatusUnauthorized, "Invalid username or password")
		return
	}

	// Generate JWT token
	token, err := h.GenerateToken(req.Username)
	if err != nil {
		fmt.Printf("[Auth] Failed to generate token: %v\n", err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to generate token")
		return
	}

	fmt.Printf("[Auth] Login success for %s\n", req.Username)
	utils.SuccessResponse(c, gin.H{
		"token": token,
		"user": gin.H{
			"username": req.Username,
			"name":     req.Username,
		},
	})
}

// Register handles user registration
func (h *AuthHandler) Register(c *gin.Context) {
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request format"})
		return
	}

	fmt.Printf("[Auth] Register attempt: User=%s\n", req.Username)

	// Validate input
	if req.Username == "" || req.Password == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Username and password are required"})
		return
	}

	// Check if user already exists
	var count int64
	h.db.Model(&model.User{}).Where("username = ?", req.Username).Count(&count)
	if count > 0 {
		utils.ErrorResponse(c, http.StatusConflict, "Username already exists")
		return
	}

	// Create user
	user := model.User{
		Username:     req.Username,
		PasswordHash: hashPassword(req.Password),
		CreatedAt:    time.Now(),
	}
	if err := h.db.Create(&user).Error; err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to create user")
		return
	}

	fmt.Printf("[Auth] Registration success for %s\n", req.Username)
	utils.SuccessResponse(c, gin.H{
		"message": "Registration successful",
		"user": gin.H{
			"username": req.Username,
		},
	})
}
