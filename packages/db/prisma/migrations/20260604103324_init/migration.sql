-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mfaEnrolled" BOOLEAN NOT NULL DEFAULT false,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "locationId" TEXT,
    "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("userId", "roleId"),
    CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    PRIMARY KEY ("roleId", "permissionId"),
    CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RefreshSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "revokedReason" TEXT,
    CONSTRAINT "RefreshSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MfaSecret" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "secretEnc" BLOB NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'SHA1',
    "digits" INTEGER NOT NULL DEFAULT 6,
    "period" INTEGER NOT NULL DEFAULT 30,
    "recoveryEnc" BLOB,
    "verifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MfaSecret_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "outcome" TEXT NOT NULL,
    "reason" TEXT,
    "attemptedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoginAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApplicantProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "nationalIdEnc" TEXT,
    "nationalIdBidx" TEXT,
    "dateOfBirthEnc" TEXT,
    "addressEnc" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "programKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "customData" TEXT NOT NULL DEFAULT '{}',
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Application_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "ApplicantProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WelfareRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "requestedAmount" DECIMAL,
    "financialBackgroundEnc" TEXT,
    "supportingNotesEnc" TEXT,
    "customData" TEXT NOT NULL DEFAULT '{}',
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WelfareRequest_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "ApplicantProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WelfareRecommendation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "recommendedBy" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "recommendedAmount" DECIMAL,
    "rationaleEnc" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WelfareRecommendation_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "WelfareRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WelfareDecision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "decidedBy" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "approvedAmount" DECIMAL,
    "notesEnc" TEXT,
    "financeJournalId" TEXT,
    "decidedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WelfareDecision_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "WelfareRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AccountingPeriod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "startsOn" DATETIME NOT NULL,
    "endsOn" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "lockedAt" DATETIME,
    "lockedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "normalSide" TEXT NOT NULL,
    "parentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPostable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Account_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entryNo" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "entryDate" DATETIME NOT NULL,
    "memo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "preparedById" TEXT NOT NULL,
    "postedById" TEXT,
    "postedAt" DATETIME,
    "reversalOfId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "sourceRef" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JournalEntry_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "AccountingPeriod" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "JournalEntry_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "JournalEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entryId" TEXT NOT NULL,
    "entryDate" DATETIME NOT NULL,
    "accountId" TEXT NOT NULL,
    "debit" DECIMAL NOT NULL DEFAULT 0,
    "credit" DECIMAL NOT NULL DEFAULT 0,
    "lineMemo" TEXT,
    "lineNo" INTEGER NOT NULL,
    CONSTRAINT "JournalLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceNo" TEXT NOT NULL,
    "customerRef" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "subtotal" DECIMAL NOT NULL,
    "taxTotal" DECIMAL NOT NULL DEFAULT 0,
    "total" DECIMAL NOT NULL,
    "issuedOn" DATETIME NOT NULL,
    "dueOn" DATETIME,
    "journalEntryId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL NOT NULL,
    "lineTotal" DECIMAL NOT NULL,
    "revenueAccountId" TEXT NOT NULL,
    CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FieldDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "label" TEXT NOT NULL,
    "fieldType" TEXT NOT NULL,
    "config" TEXT NOT NULL DEFAULT '{}',
    "uiSchema" TEXT NOT NULL DEFAULT '{}',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "readPermission" TEXT,
    "writePermission" TEXT,
    "supersedesId" TEXT,
    "createdById" TEXT NOT NULL,
    "publishedAt" DATETIME,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FieldDefinition_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "FieldDefinition" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FormDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "sections" TEXT NOT NULL DEFAULT '[]',
    "uiSchema" TEXT NOT NULL DEFAULT '{}',
    "supersedesId" TEXT,
    "createdById" TEXT NOT NULL,
    "publishedAt" DATETIME,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FormDefinition_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "FormDefinition" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PromptTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "description" TEXT,
    "template" TEXT NOT NULL,
    "variables" TEXT NOT NULL DEFAULT '[]',
    "defaultProvider" TEXT NOT NULL DEFAULT 'OLLAMA',
    "defaultModel" TEXT,
    "createdById" TEXT NOT NULL,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AiRequestLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT NOT NULL,
    "roleSnapshot" TEXT NOT NULL,
    "templateKey" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "promptHash" TEXT NOT NULL,
    "promptRedacted" TEXT,
    "responseHash" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCost" DECIMAL NOT NULL DEFAULT 0,
    "outputKind" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "BrandProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scope" TEXT NOT NULL DEFAULT 'GLOBAL',
    "locationId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "appName" TEXT NOT NULL,
    "tagline" TEXT,
    "footerText" TEXT,
    "imagery" TEXT NOT NULL DEFAULT '{}',
    "createdById" TEXT NOT NULL,
    "publishedAt" DATETIME,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ThemeTokens" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "brandProfileId" TEXT NOT NULL,
    "tokens" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ThemeTokens_brandProfileId_fkey" FOREIGN KEY ("brandProfileId") REFERENCES "BrandProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BrandAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "brandProfileId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BrandAsset_brandProfileId_fkey" FOREIGN KEY ("brandProfileId") REFERENCES "BrandProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE INDEX "UserRole_roleId_idx" ON "UserRole"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshSession_tokenHash_key" ON "RefreshSession"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshSession_userId_idx" ON "RefreshSession"("userId");

-- CreateIndex
CREATE INDEX "RefreshSession_expiresAt_idx" ON "RefreshSession"("expiresAt");

-- CreateIndex
CREATE INDEX "LoginAttempt_email_attemptedAt_idx" ON "LoginAttempt"("email", "attemptedAt");

-- CreateIndex
CREATE INDEX "LoginAttempt_ipAddress_attemptedAt_idx" ON "LoginAttempt"("ipAddress", "attemptedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicantProfile_userId_key" ON "ApplicantProfile"("userId");

-- CreateIndex
CREATE INDEX "ApplicantProfile_email_idx" ON "ApplicantProfile"("email");

-- CreateIndex
CREATE INDEX "ApplicantProfile_nationalIdBidx_idx" ON "ApplicantProfile"("nationalIdBidx");

-- CreateIndex
CREATE UNIQUE INDEX "Application_reference_key" ON "Application"("reference");

-- CreateIndex
CREATE INDEX "Application_applicantId_idx" ON "Application"("applicantId");

-- CreateIndex
CREATE INDEX "Application_status_idx" ON "Application"("status");

-- CreateIndex
CREATE INDEX "Application_programKey_status_idx" ON "Application"("programKey", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WelfareRequest_reference_key" ON "WelfareRequest"("reference");

-- CreateIndex
CREATE INDEX "WelfareRequest_applicantId_idx" ON "WelfareRequest"("applicantId");

-- CreateIndex
CREATE INDEX "WelfareRequest_status_idx" ON "WelfareRequest"("status");

-- CreateIndex
CREATE INDEX "WelfareRequest_type_status_idx" ON "WelfareRequest"("type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WelfareRecommendation_requestId_key" ON "WelfareRecommendation"("requestId");

-- CreateIndex
CREATE INDEX "WelfareRecommendation_recommendedBy_idx" ON "WelfareRecommendation"("recommendedBy");

-- CreateIndex
CREATE UNIQUE INDEX "WelfareDecision_requestId_key" ON "WelfareDecision"("requestId");

-- CreateIndex
CREATE INDEX "WelfareDecision_decidedBy_idx" ON "WelfareDecision"("decidedBy");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingPeriod_code_key" ON "AccountingPeriod"("code");

-- CreateIndex
CREATE INDEX "AccountingPeriod_status_idx" ON "AccountingPeriod"("status");

-- CreateIndex
CREATE INDEX "AccountingPeriod_startsOn_endsOn_idx" ON "AccountingPeriod"("startsOn", "endsOn");

-- CreateIndex
CREATE UNIQUE INDEX "Account_code_key" ON "Account"("code");

-- CreateIndex
CREATE INDEX "Account_type_idx" ON "Account"("type");

-- CreateIndex
CREATE INDEX "Account_parentId_idx" ON "Account"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_entryNo_key" ON "JournalEntry"("entryNo");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_reversalOfId_key" ON "JournalEntry"("reversalOfId");

-- CreateIndex
CREATE INDEX "JournalEntry_periodId_status_idx" ON "JournalEntry"("periodId", "status");

-- CreateIndex
CREATE INDEX "JournalEntry_entryDate_idx" ON "JournalEntry"("entryDate");

-- CreateIndex
CREATE INDEX "JournalEntry_source_sourceRef_idx" ON "JournalEntry"("source", "sourceRef");

-- CreateIndex
CREATE INDEX "JournalLine_accountId_idx" ON "JournalLine"("accountId");

-- CreateIndex
CREATE INDEX "JournalLine_entryId_idx" ON "JournalLine"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "JournalLine_entryId_lineNo_key" ON "JournalLine"("entryId", "lineNo");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNo_key" ON "Invoice"("invoiceNo");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_journalEntryId_key" ON "Invoice"("journalEntryId");

-- CreateIndex
CREATE INDEX "Invoice_customerRef_idx" ON "Invoice"("customerRef");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "FieldDefinition_supersedesId_key" ON "FieldDefinition"("supersedesId");

-- CreateIndex
CREATE INDEX "FieldDefinition_entityType_key_status_idx" ON "FieldDefinition"("entityType", "key", "status");

-- CreateIndex
CREATE INDEX "FieldDefinition_status_idx" ON "FieldDefinition"("status");

-- CreateIndex
CREATE UNIQUE INDEX "FieldDefinition_entityType_key_version_key" ON "FieldDefinition"("entityType", "key", "version");

-- CreateIndex
CREATE UNIQUE INDEX "FormDefinition_supersedesId_key" ON "FormDefinition"("supersedesId");

-- CreateIndex
CREATE INDEX "FormDefinition_key_status_idx" ON "FormDefinition"("key", "status");

-- CreateIndex
CREATE INDEX "FormDefinition_entityType_status_idx" ON "FormDefinition"("entityType", "status");

-- CreateIndex
CREATE INDEX "FormDefinition_status_idx" ON "FormDefinition"("status");

-- CreateIndex
CREATE UNIQUE INDEX "FormDefinition_key_version_key" ON "FormDefinition"("key", "version");

-- CreateIndex
CREATE INDEX "PromptTemplate_key_status_idx" ON "PromptTemplate"("key", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PromptTemplate_key_version_key" ON "PromptTemplate"("key", "version");

-- CreateIndex
CREATE INDEX "AiRequestLog_actorId_createdAt_idx" ON "AiRequestLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AiRequestLog_provider_createdAt_idx" ON "AiRequestLog"("provider", "createdAt");

-- CreateIndex
CREATE INDEX "BrandProfile_scope_locationId_status_idx" ON "BrandProfile"("scope", "locationId", "status");

-- CreateIndex
CREATE INDEX "BrandProfile_status_idx" ON "BrandProfile"("status");

-- CreateIndex
CREATE UNIQUE INDEX "BrandProfile_scope_locationId_version_key" ON "BrandProfile"("scope", "locationId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ThemeTokens_brandProfileId_key" ON "ThemeTokens"("brandProfileId");

-- CreateIndex
CREATE INDEX "BrandAsset_brandProfileId_idx" ON "BrandAsset"("brandProfileId");
