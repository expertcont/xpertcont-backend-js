CREATE TABLE IF NOT EXISTS public.mad_menu_permiso_item (
  id_usuario VARCHAR(50) NOT NULL,
  id_invitado VARCHAR(50) NOT NULL,
  id_item VARCHAR(50) NOT NULL,
  permitido CHAR(1) NOT NULL DEFAULT 'S',
  fecha_registro TIMESTAMP(5) WITHOUT TIME ZONE DEFAULT now(),
  usuario_registro VARCHAR(50),
  CONSTRAINT mad_menu_permiso_item_pkey PRIMARY KEY (id_usuario, id_invitado, id_item),
  CONSTRAINT mad_menu_permiso_item_usuario_fk
    FOREIGN KEY (id_usuario, id_invitado)
    REFERENCES public.mad_usuarioinvitado (id_usuario, id_invitado),
  CONSTRAINT mad_menu_permiso_item_item_fk
    FOREIGN KEY (id_item)
    REFERENCES public.mad_menu_item (id_item),
  CONSTRAINT mad_menu_permiso_item_permitido_chk CHECK (permitido IN ('S', 'N'))
);

CREATE INDEX IF NOT EXISTS idx_mad_menu_permiso_item_invitado
  ON public.mad_menu_permiso_item (id_usuario, id_invitado, permitido);

CREATE TABLE IF NOT EXISTS public.mad_menu_permiso_accion (
  id_usuario VARCHAR(50) NOT NULL,
  id_invitado VARCHAR(50) NOT NULL,
  id_accion VARCHAR(50) NOT NULL,
  permitido CHAR(1) NOT NULL DEFAULT 'S',
  fecha_registro TIMESTAMP(5) WITHOUT TIME ZONE DEFAULT now(),
  usuario_registro VARCHAR(50),
  CONSTRAINT mad_menu_permiso_accion_pkey PRIMARY KEY (id_usuario, id_invitado, id_accion),
  CONSTRAINT mad_menu_permiso_accion_usuario_fk
    FOREIGN KEY (id_usuario, id_invitado)
    REFERENCES public.mad_usuarioinvitado (id_usuario, id_invitado),
  CONSTRAINT mad_menu_permiso_accion_accion_fk
    FOREIGN KEY (id_accion)
    REFERENCES public.mad_menu_accion (id_accion),
  CONSTRAINT mad_menu_permiso_accion_permitido_chk CHECK (permitido IN ('S', 'N'))
);

CREATE INDEX IF NOT EXISTS idx_mad_menu_permiso_accion_invitado
  ON public.mad_menu_permiso_accion (id_usuario, id_invitado, permitido);
