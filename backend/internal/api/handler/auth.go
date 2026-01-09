package handler

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// AuthHandler handles authentication
type AuthHandler struct {
	// Simple in-memory user store for demo purposes
	users map[string]string
}

func NewAuthHandler() *AuthHandler {
	return &AuthHandler{
		users: map[string]string{
			"admin": "admin123",
		},
	}
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

	// Check against in-memory store
	storedPwd, exists := h.users[req.Username]
	if exists && storedPwd == req.Password {
		fmt.Printf("[Auth] Login success for %s\n", req.Username)
		c.JSON(http.StatusOK, gin.H{
			"token": "mock-secure-token-" + uuid.New().String(),
			"user": gin.H{
				"username": req.Username,
				"name":     req.Username, // Use username as name for simplicity
			},
		})
		return
	}

	fmt.Printf("[Auth] Login failed for %s. Exists=%v\n", req.Username, exists)
	c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid username or password"})
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
	if _, exists := h.users[req.Username]; exists {
		c.JSON(http.StatusConflict, gin.H{"error": "Username already exists"})
		return
	}

	// Store user
	h.users[req.Username] = req.Password
	fmt.Printf("[Auth] Registration success for %s\n", req.Username)

	// Success response
	c.JSON(http.StatusOK, gin.H{
		"message": "Registration successful",
		"user": gin.H{
			"username": req.Username,
		},
	})
}
