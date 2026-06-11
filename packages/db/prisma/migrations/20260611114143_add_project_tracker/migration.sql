-- CreateTable
CREATE TABLE "project_trackers" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "project_name" TEXT NOT NULL,
    "website_link" TEXT,
    "ojt_name" TEXT,
    "framework" TEXT,
    "lead_name" TEXT,
    "project_given_date" TEXT,
    "start_date" TEXT,
    "end_date" TEXT,
    "deadline" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Not Started',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
