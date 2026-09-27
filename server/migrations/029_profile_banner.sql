-- Player profile banner.
-- Stores the URL/path of the image selected by the profile owner.

ALTER TABLE users
ADD COLUMN profile_banner_url TEXT;
