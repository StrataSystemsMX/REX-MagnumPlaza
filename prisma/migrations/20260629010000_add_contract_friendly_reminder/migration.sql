-- Política de morosidad (protocolo de 2 meses): recordatorio amable previo (1 mes)
-- opcional por contrato. El aviso fuerte/desalojo a los 2 meses es el detonante
-- automático y no depende de este flag.
ALTER TABLE "contracts" ADD COLUMN "friendlyReminderEnabled" BOOLEAN NOT NULL DEFAULT false;
