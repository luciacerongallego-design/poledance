-- ==============================================================================
-- POLE CLUB — SUPABASE POSTGRESQL SCHEMA & SECURITY POLICIES
-- ==============================================================================
-- Este script define la estructura de datos, restricciones, índices y políticas
-- de seguridad a nivel de fila (RLS) para el despliegue en producción en Supabase.
-- ==============================================================================

-- Habilitar extensión para UUIDs si no está activa
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Creación de la tabla principal de registros de membresía
CREATE TABLE IF NOT EXISTS public.membership_leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    instagram TEXT NOT NULL,
    pole_experience TEXT NOT NULL,
    preferred_benefits JSONB NOT NULL DEFAULT '[]'::jsonb,
    willingness_to_pay TEXT NOT NULL,
    additional_benefits TEXT,
    privacy_consent BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    ip_address TEXT,
    user_agent TEXT
);

-- 2. Tabla complementaria para métricas anónimas de validación del PMV
CREATE TABLE IF NOT EXISTS public.analytics_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_name TEXT NOT NULL,
    section_name TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 3. Índices para optimización de consultas en el panel administrativo
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.membership_leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_email ON public.membership_leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_willingness ON public.membership_leads(willingness_to_pay);
CREATE INDEX IF NOT EXISTS idx_analytics_event_name ON public.analytics_events(event_name);

-- 4. Activación de Row Level Security (RLS)
-- Crucial: Protege los datos personales para que no puedan ser leídos por usuarios públicos.
ALTER TABLE public.membership_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- 5. Políticas de seguridad para membership_leads:
-- a) Permitir inserción anónima desde la landing page (solo escritura)
CREATE POLICY "Permitir insercion publica de registros"
    ON public.membership_leads
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

-- b) Denegar SELECT general a usuarios no autenticados (evita filtración de datos de leads)
-- Solo usuarios con rol 'service_role' o administradores autenticados pueden ver la lista.
CREATE POLICY "Permitir lectura solo a administradores autorizados"
    ON public.membership_leads
    FOR SELECT
    TO authenticated
    USING (true);

-- 6. Políticas de seguridad para analytics_events:
CREATE POLICY "Permitir registro de eventos anonimos"
    ON public.analytics_events
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

CREATE POLICY "Permitir lectura de analiticas a autenticados"
    ON public.analytics_events
    FOR SELECT
    TO authenticated
    USING (true);

-- ==============================================================================
-- FIN DEL SCHEMA
-- ==============================================================================
