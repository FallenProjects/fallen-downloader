package api

import (
	"dl/internal/httpx"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/log"
)

func snapHandler(c fiber.Ctx, client *httpx.Client) error {
	url := GetUrl(c)
	if url == "" {
		return c.Status(fiber.StatusBadRequest).JSON(
			NewErrorResponse(fiber.StatusBadRequest, "Parameter 'url' is required"),
		)
	}

	data, err := client.GetSnap(url)
	if err != nil {
		log.Errorf("Error fetching snap data for URL %s: %v", url, err)
		return c.Status(fiber.StatusInternalServerError).JSON(
			NewErrorResponseFromError(fiber.StatusInternalServerError, err),
		)
	}

	return c.JSON(data)
}

func infoHandler(c fiber.Ctx, client *httpx.Client) error {
	url := GetUrl(c)
	if url == "" {
		return c.Status(fiber.StatusBadRequest).JSON(
			NewErrorResponse(fiber.StatusBadRequest, "Parameter 'url' is required"),
		)
	}

	data, err := client.GetMusicInfo(url)
	if err != nil {
		log.Errorf("Error fetching snap data for URL %s: %v", url, err)
		return c.Status(fiber.StatusInternalServerError).JSON(
			NewErrorResponseFromError(fiber.StatusInternalServerError, err),
		)
	}

	return c.JSON(data)
}

func dlHandler(c fiber.Ctx, client *httpx.Client) error {
	url := GetUrl(c)
	if url == "" {
		return c.Status(fiber.StatusBadRequest).JSON(
			NewErrorResponse(fiber.StatusBadRequest, "Parameter 'url' is required"),
		)
	}

	data, err := client.DownloadTrack(url)
	if err != nil {
		log.Errorf("Error downloading track for URL %s: %v", url, err)
		return c.Status(fiber.StatusInternalServerError).JSON(
			NewErrorResponseFromError(fiber.StatusInternalServerError, err),
		)
	}

	return c.JSON(data)
}
