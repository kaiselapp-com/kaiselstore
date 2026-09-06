-- Kaisel Store — PostgreSQL schema (production target for the prototype's document store)

CREATE TABLE users (
  uid            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          CITEXT UNIQUE NOT NULL,
  display_name   TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','developer','admin')),
  provider       TEXT NOT NULL DEFAULT 'password' CHECK (provider IN ('password','google','demo')),
  avatar_hue     INT NOT NULL DEFAULT 160,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE developers (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  name        TEXT NOT NULL UNIQUE,
  slug        TEXT NOT NULL UNIQUE,
  bio         TEXT NOT NULL DEFAULT '',
  website     TEXT NOT NULL DEFAULT '',
  country     TEXT NOT NULL DEFAULT '',
  verified    BOOLEAN NOT NULL DEFAULT false,
  hue         INT NOT NULL DEFAULT 160,
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  id     TEXT PRIMARY KEY,
  name   TEXT NOT NULL,
  slug   TEXT NOT NULL UNIQUE,
  hue    INT NOT NULL DEFAULT 160,
  glyph  TEXT NOT NULL DEFAULT 'box'
);

CREATE TABLE applications (
  id             BIGSERIAL PRIMARY KEY,
  package_name   TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  tagline        TEXT NOT NULL DEFAULT '',
  developer_id   BIGINT NOT NULL REFERENCES developers(id),
  description    JSONB NOT NULL DEFAULT '[]',
  features       JSONB NOT NULL DEFAULT '[]',
  whats_new      TEXT NOT NULL DEFAULT '',
  icon           JSONB NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('approved','pending','rejected','disabled')),
  featured       BOOLEAN NOT NULL DEFAULT false,
  base_downloads BIGINT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE application_versions (
  id                 BIGSERIAL PRIMARY KEY,
  application_id     BIGINT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  version_name       TEXT NOT NULL,
  version_code       BIGINT NOT NULL,
  min_sdk            INT NOT NULL,
  target_sdk         INT NOT NULL,
  changelog          TEXT NOT NULL DEFAULT '',
  status             TEXT NOT NULL DEFAULT 'processing'
                     CHECK (status IN ('processing','ready','failed','removed')),
  signing_fingerprint TEXT NOT NULL DEFAULT '',          -- SHA-256 of the APK signing cert
  job_id             TEXT,
  released_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (application_id, version_code)
);

CREATE TABLE artifacts (
  id                  BIGSERIAL PRIMARY KEY,
  application_id      BIGINT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  application_version_id BIGINT NOT NULL REFERENCES application_versions(id) ON DELETE CASCADE,
  package_name        TEXT NOT NULL,
  version_code        BIGINT NOT NULL,
  version_name        TEXT NOT NULL,
  artifact_type       TEXT NOT NULL CHECK (artifact_type IN ('apk','aab','universal-apk','split-apk')),
  split_name          TEXT,                               -- base | config.arm64_v8a | config.xxhdpi | NULL
  abi                 TEXT[] NOT NULL DEFAULT '{universal}',
  min_sdk             INT NOT NULL,
  max_sdk             INT,
  density             INT,
  supported_features  TEXT[] NOT NULL DEFAULT '{}',
  gl_version          TEXT,
  file_path           TEXT NOT NULL,                      -- vault key; never exposed by the API
  file_size           BIGINT NOT NULL,
  sha256              CHAR(64) NOT NULL,
  source              TEXT NOT NULL DEFAULT 'upload' CHECK (source IN ('upload','seed','derived')),
  status              TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','generating','failed')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE artifact_compatibility (
  artifact_id   BIGINT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  abi           TEXT NOT NULL,
  min_sdk       INT NOT NULL,
  max_sdk       INT,
  density       INT,
  PRIMARY KEY (artifact_id, abi, COALESCE(density, 0))
);

CREATE TABLE application_categories (
  application_id BIGINT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  category_id    TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (application_id, category_id)
);

CREATE TABLE screenshots (
  id              BIGSERIAL PRIMARY KEY,
  application_id  BIGINT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  variant         INT NOT NULL DEFAULT 0,
  label           TEXT NOT NULL DEFAULT '',
  position        INT NOT NULL DEFAULT 0
);

CREATE TABLE app_permissions (
  id              BIGSERIAL PRIMARY KEY,
  application_id  BIGINT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  purpose         TEXT NOT NULL DEFAULT ''
);

CREATE TABLE reviews (
  id              BIGSERIAL PRIMARY KEY,
  application_id  BIGINT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES users(uid) ON DELETE SET NULL,
  user_name       TEXT NOT NULL,
  rating          INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title           TEXT NOT NULL DEFAULT '',
  body            TEXT NOT NULL DEFAULT '',
  helpful         INT NOT NULL DEFAULT 0,
  hidden          BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at       TIMESTAMPTZ,
  UNIQUE (application_id, user_id)
);

CREATE TABLE downloads (
  id              BIGSERIAL PRIMARY KEY,
  session_id      TEXT NOT NULL,
  artifact_id     BIGINT NOT NULL REFERENCES artifacts(id),
  application_id  BIGINT NOT NULL REFERENCES applications(id),
  version_code    BIGINT NOT NULL,
  user_id         UUID REFERENCES users(uid) ON DELETE SET NULL,
  device_label    TEXT NOT NULL DEFAULT '',
  bytes           BIGINT NOT NULL,
  sha256          CHAR(64) NOT NULL,
  verified        BOOLEAN,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE device_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES users(uid) ON DELETE CASCADE,
  label               TEXT NOT NULL,
  manufacturer        TEXT NOT NULL DEFAULT '',
  model               TEXT NOT NULL DEFAULT '',
  android_api         INT NOT NULL,
  abi                 TEXT NOT NULL,
  density             INT NOT NULL,
  screen_width        INT NOT NULL DEFAULT 0,
  screen_height       INT NOT NULL DEFAULT 0,
  supported_features  TEXT[] NOT NULL DEFAULT '{}',
  gl_version          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE processing_jobs (
  id              TEXT PRIMARY KEY,
  application_id  BIGINT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  version_id      BIGINT REFERENCES application_versions(id) ON DELETE SET NULL,
  file_name       TEXT NOT NULL,
  file_kind       TEXT NOT NULL,
  file_size       BIGINT NOT NULL,
  state           TEXT NOT NULL DEFAULT 'UPLOADED'
                  CHECK (state IN ('UPLOADED','PROCESSING','ANALYZING','GENERATING_ARTIFACTS','READY','FAILED','REJECTED')),
  progress        INT NOT NULL DEFAULT 0,
  logs            JSONB NOT NULL DEFAULT '[]',
  bundletool      TEXT NOT NULL DEFAULT 'mock',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at     TIMESTAMPTZ
);

CREATE TABLE featured_apps (
  application_id BIGINT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  position       INT NOT NULL,
  PRIMARY KEY (application_id)
);

CREATE TABLE app_reports (
  id              BIGSERIAL PRIMARY KEY,
  application_id  BIGINT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  reason          TEXT NOT NULL,
  detail          TEXT NOT NULL DEFAULT '',
  reporter        TEXT NOT NULL DEFAULT 'anonymous',
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE installed_apps (
  device_profile_id UUID NOT NULL REFERENCES device_profiles(id) ON DELETE CASCADE,
  package_name      TEXT NOT NULL,
  version_code      BIGINT NOT NULL,
  version_name      TEXT NOT NULL DEFAULT '',
  installed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (device_profile_id, package_name)
);

-- hot-path indexes
CREATE INDEX idx_applications_package      ON applications (package_name);
CREATE INDEX idx_applications_name_trgm    ON applications USING gin (name gin_trgm_ops);
CREATE INDEX idx_applications_status       ON applications (status) WHERE status = 'approved';
CREATE INDEX idx_versions_application      ON application_versions (application_id, version_code DESC);
CREATE INDEX idx_artifacts_version         ON artifacts (application_version_id) WHERE status = 'available';
CREATE INDEX idx_artifacts_package         ON artifacts (package_name);
CREATE INDEX idx_compat_artifact           ON artifact_compatibility (artifact_id);
CREATE INDEX idx_downloads_application     ON downloads (application_id, created_at DESC);
CREATE INDEX idx_downloads_user            ON downloads (user_id, created_at DESC);
CREATE INDEX idx_reviews_application       ON reviews (application_id, created_at DESC) WHERE NOT hidden;
CREATE INDEX idx_jobs_application          ON processing_jobs (application_id, created_at DESC);
CREATE INDEX idx_jobs_state                ON processing_jobs (state);
