package main

import (
	"log"

	"github.com/boncore/pos-backend/internal/config"
	"github.com/boncore/pos-backend/internal/repository"
)

func main() {
	cfg := config.Load()
	log.Println("[Migration CLI] Starting BonCore SaaS Master DB Migration & Seeding...")

	dm, err := repository.NewDatabaseManager(cfg)
	if err != nil {
		log.Fatalf("[FATAL] Failed to initialize DatabaseManager: %v", err)
	}
	defer dm.Close()

	if err := repository.SeedMasterSaaSData(dm); err != nil {
		log.Fatalf("[FATAL] SeedMasterSaaSData failed: %v", err)
	}

	log.Println("[Migration CLI] BonCore SaaS Master DB Migration & Seeding completed successfully.")
}
