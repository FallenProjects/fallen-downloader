package api

import "github.com/gofiber/fiber/v3"

type DownloadRequest struct {
	URL string `json:"url"`
}

func GetUrl(c fiber.Ctx) string {
	var req DownloadRequest
	if c.Method() == fiber.MethodGet {
		req.URL = c.Query("url")
	} else {
		if err := c.Bind().Body(&req); err != nil {
			return ""
		}
	}

	return req.URL
}

// ErrorResponse represents a standardized error response structure for API responses.
type ErrorResponse struct {
	// Code is the HTTP status code
	Code int `json:"code"`
	// Message is a human-readable message describing the error
	Message string `json:"message"`
}

// Error implements the error interface
func (e *ErrorResponse) Error() string {
	return e.Message
}

// NewErrorResponse creates a new ErrorResponse with the given status code and error message
func NewErrorResponse(code int, message string) *ErrorResponse {
	return &ErrorResponse{
		Code:    code,
		Message: message,
	}
}

// NewErrorResponseFromError creates a new ErrorResponse from an error
func NewErrorResponseFromError(code int, err error) *ErrorResponse {
	return NewErrorResponse(code, err.Error())
}
