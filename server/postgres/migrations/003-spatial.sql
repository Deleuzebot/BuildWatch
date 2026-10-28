-- PostGIS and pg_trgm are free database extensions, not additional hosted services.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
SET search_path=buildwatch,extensions,public;
ALTER TABLE map_index ADD COLUMN geom extensions.geometry(Point,4326)
 GENERATED ALWAYS AS (extensions.st_setsrid(extensions.st_makepoint(longitude,latitude),4326)) STORED;
CREATE INDEX map_geography ON map_index USING gist(geom);
CREATE INDEX map_search_trigram ON map_index USING gin(searchtext extensions.gin_trgm_ops);
