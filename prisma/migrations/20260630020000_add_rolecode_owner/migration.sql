-- Rol OWNER (dueño solo consulta / read-only). Aditivo: agregar el valor al
-- enum no cambia el comportamiento hasta que se asigne el rol a algún usuario.
ALTER TYPE "RoleCode" ADD VALUE 'OWNER' AFTER 'ACCOUNTANT';
