import type {
  AuditAction,
  BudgetConceptType,
  CommunicationChannel,
  ContractStatus,
  ContractType,
  DocumentType,
  ExpenseType,
  GuaranteeStatus,
  MaintenanceResponsibility,
  MaintenanceStatus,
  MaintenanceType,
  NotificationRecipientType,
  NotificationStatus,
  PaymentMethod,
  PayrollType,
  Plan,
  PropertyStatus,
  PropertyType,
  RentStatus,
  RoleCode,
  UnitStatus,
} from "@/generated/prisma/enums";

function exhaustive(value: never): never {
  throw new Error(`Valor de enum no manejado: ${String(value)}`);
}

export function planLabel(p: Plan): string {
  switch (p) {
    case "STARTER":
      return "Starter (≤30 unidades)";
    case "GROWTH":
      return "Growth (≤100 unidades)";
    case "ENTERPRISE":
      return "Enterprise (ilimitado)";
    default:
      return exhaustive(p);
  }
}

export function roleCodeLabel(r: RoleCode): string {
  switch (r) {
    case "MASTER":
      return "Master";
    case "ADMIN":
      return "Administrador";
    case "ACCOUNTANT":
      return "Contador";
    case "PROMOTER":
      return "Promotor";
    case "LESSEE":
      return "Inquilino";
    default:
      return exhaustive(r);
  }
}

export function propertyTypeLabel(t: PropertyType): string {
  switch (t) {
    case "PLAZA_COMERCIAL":
      return "Plaza Comercial";
    case "TERRENO_RENTADO":
      return "Terreno Rentado";
    case "EDIFICIO":
      return "Edificio";
    case "OFICINA":
      return "Oficina";
    case "CASA":
      return "Casa";
    case "BODEGA":
      return "Bodega";
    case "ESPECTACULAR":
      return "Espectacular";
    case "OTRO":
      return "Otro";
    default:
      return exhaustive(t);
  }
}

export function propertyStatusLabel(s: PropertyStatus): string {
  switch (s) {
    case "ACTIVO":
      return "Activo";
    case "BLOQUEADO":
      return "Bloqueado";
    default:
      return exhaustive(s);
  }
}

export function unitStatusLabel(s: UnitStatus): string {
  switch (s) {
    case "DISPONIBLE":
      return "Disponible";
    case "APARTADA":
      return "Apartada";
    case "RENTADA":
      return "Rentada";
    case "EN_REMODELACION":
      return "En remodelación";
    case "NO_DISPONIBLE":
      return "No disponible";
    default:
      return exhaustive(s);
  }
}

export function unitStatusVariant(s: UnitStatus): "default" | "secondary" | "destructive" | "outline" {
  switch (s) {
    case "DISPONIBLE":
      return "secondary";
    case "APARTADA":
      return "outline";
    case "RENTADA":
      return "default";
    case "EN_REMODELACION":
    case "NO_DISPONIBLE":
      return "destructive";
    default:
      return exhaustive(s);
  }
}

export function communicationChannelLabel(c: CommunicationChannel): string {
  switch (c) {
    case "WHATSAPP":
      return "WhatsApp";
    case "EMAIL":
      return "Correo electrónico";
    case "SMS":
      return "SMS";
    case "PHONE_CALL":
      return "Llamada";
    case "IN_PERSON":
      return "En persona";
    default:
      return exhaustive(c);
  }
}

export function contractTypeLabel(t: ContractType): string {
  switch (t) {
    case "ARRENDAMIENTO":
      return "Arrendamiento";
    case "COMODATO":
      return "Comodato";
    case "ADMINISTRACION_INTERNA":
      return "Administración interna";
    case "COMPRAVENTA":
      return "Compraventa";
    default:
      return exhaustive(t);
  }
}

export function contractStatusLabel(s: ContractStatus): string {
  switch (s) {
    case "DRAFT":
      return "Borrador";
    case "ACTIVE":
      return "Activo";
    case "EXPIRED":
      return "Vencido";
    case "TERMINATED":
      return "Terminado anticipadamente";
    case "CANCELLED":
      return "Cancelado";
    case "PENDING_RENEWAL":
      return "Por renovar";
    default:
      return exhaustive(s);
  }
}

export function contractStatusVariant(
  s: ContractStatus,
): "default" | "secondary" | "destructive" | "outline" {
  switch (s) {
    case "DRAFT":
      return "secondary";
    case "ACTIVE":
      return "default";
    case "PENDING_RENEWAL":
      return "outline";
    case "EXPIRED":
    case "TERMINATED":
    case "CANCELLED":
      return "destructive";
    default:
      return exhaustive(s);
  }
}

export function rentStatusVariant(
  s: RentStatus,
): "default" | "secondary" | "destructive" | "outline" {
  switch (s) {
    case "PAID":
    case "WAIVED":
      return "default";
    case "PENDING":
      return "secondary";
    case "PARTIAL":
      return "outline";
    case "DUE":
    case "OVERDUE_1M":
    case "OVERDUE_2M":
    case "OVERDUE_3M":
      return "destructive";
    default:
      return exhaustive(s);
  }
}

export function rentStatusLabel(s: RentStatus): string {
  switch (s) {
    case "PENDING":
      return "Pendiente";
    case "DUE":
      return "Vencido";
    case "PARTIAL":
      return "Pago parcial";
    case "PAID":
      return "Pagado";
    case "OVERDUE_1M":
      return "1 mes vencido";
    case "OVERDUE_2M":
      return "2 meses vencidos";
    case "OVERDUE_3M":
      return "3 meses vencidos";
    case "WAIVED":
      return "Condonado";
    default:
      return exhaustive(s);
  }
}

export function paymentMethodLabel(m: PaymentMethod): string {
  switch (m) {
    case "CASH":
      return "Efectivo";
    case "TRANSFER":
      return "Transferencia";
    case "CHECK":
      return "Cheque";
    case "DEPOSIT":
      return "Depósito bancario";
    case "CARD":
      return "Tarjeta";
    case "OTHER":
      return "Otro";
    default:
      return exhaustive(m);
  }
}

export function guaranteeStatusLabel(s: GuaranteeStatus): string {
  switch (s) {
    case "HELD":
      return "En custodia";
    case "PARTIALLY_RETURNED":
      return "Devuelto parcial";
    case "RETURNED":
      return "Devuelto";
    case "APPLIED_TO_DEBT":
      return "Aplicado a saldo";
    default:
      return exhaustive(s);
  }
}

export function expenseTypeLabel(t: ExpenseType): string {
  switch (t) {
    case "PAYROLL":
      return "Nómina";
    case "TAX":
      return "Impuesto";
    case "UTILITY":
      return "Servicio";
    case "MAINTENANCE":
      return "Mantenimiento";
    case "INSURANCE":
      return "Seguro";
    case "FINANCING":
      return "Financiamiento";
    case "PROFESSIONAL_FEE":
      return "Honorarios";
    case "BANK_FEE":
      return "Comisión bancaria";
    case "OFFICE":
      return "Oficina";
    case "VEHICLE":
      return "Vehículo";
    case "OTHER":
      return "Otro";
    default:
      return exhaustive(t);
  }
}

export function payrollTypeLabel(t: PayrollType): string {
  switch (t) {
    case "ADMIN_SERVICE_INVOICE":
      return "Factura de servicios administrativos";
    case "DIRECT_PAYROLL":
      return "Nómina directa";
    case "STRATEGY_NOMINA":
      return "Nómina estratégica";
    case "COMMISSION":
      return "Comisión";
    case "BONUS":
      return "Bono";
    default:
      return exhaustive(t);
  }
}

export function maintenanceTypeLabel(t: MaintenanceType): string {
  switch (t) {
    case "PERIODIC":
      return "Periódico";
    case "CORRECTIVE":
      return "Correctivo";
    case "PREVENTIVE":
      return "Preventivo";
    case "EMERGENCY":
      return "Emergencia";
    case "REMODELING":
      return "Remodelación";
    default:
      return exhaustive(t);
  }
}

export function maintenanceStatusLabel(s: MaintenanceStatus): string {
  switch (s) {
    case "PLANNED":
      return "Planeado";
    case "IN_PROGRESS":
      return "En progreso";
    case "COMPLETED":
      return "Completado";
    case "CANCELLED":
      return "Cancelado";
    case "OVERDUE":
      return "Atrasado";
    default:
      return exhaustive(s);
  }
}

export function maintenanceResponsibilityLabel(r: MaintenanceResponsibility): string {
  switch (r) {
    case "OWNER":
      return "Dueño";
    case "LESSEE":
      return "Inquilino";
    case "SHARED":
      return "Compartido";
    default:
      return exhaustive(r);
  }
}

export function budgetConceptTypeLabel(c: BudgetConceptType): string {
  switch (c) {
    case "INCOME_RENT":
      return "Ingreso por renta";
    case "INCOME_BILLBOARD":
      return "Ingreso por espectacular";
    case "INCOME_GUARANTEE":
      return "Depósito en garantía";
    case "INCOME_OTHER":
      return "Otro ingreso";
    case "EXPENSE":
      return "Egreso";
    case "TAX_STRATEGY":
      return "Estrategia fiscal";
    case "DEBT_SERVICE":
      return "Servicio de deuda";
    default:
      return exhaustive(c);
  }
}

export function documentTypeLabel(t: DocumentType): string {
  switch (t) {
    case "CONTRACT_PDF":
      return "Contrato (PDF)";
    case "PROPERTY_PHOTO":
      return "Foto del inmueble";
    case "UNIT_PHOTO":
      return "Foto de la unidad";
    case "UNIT_PHOTO_INITIAL":
      return "Foto inicial de la unidad";
    case "UNIT_PHOTO_FINAL":
      return "Foto final de la unidad";
    case "INVOICE":
      return "Factura";
    case "CADASTRAL_RECEIPT":
      return "Boleta predial";
    case "EVICTION_LETTER":
      return "Carta de desalojo";
    case "PAYMENT_REMINDER":
      return "Aviso de pago";
    case "MAINTENANCE_PHOTO":
      return "Foto de mantenimiento";
    case "IDENTIFICATION":
      return "Identificación";
    case "PROOF_OF_ADDRESS":
      return "Comprobante de domicilio";
    case "OTHER":
      return "Otro";
    default:
      return exhaustive(t);
  }
}

export function notificationRecipientTypeLabel(t: NotificationRecipientType): string {
  switch (t) {
    case "LESSEE":
      return "Inquilino";
    case "PROMOTER":
      return "Promotor";
    case "USER":
      return "Usuario interno";
    case "EXTERNAL":
      return "Externo";
    default:
      return exhaustive(t);
  }
}

export function notificationStatusLabel(s: NotificationStatus): string {
  switch (s) {
    case "PENDING":
      return "Pendiente";
    case "SENT":
      return "Enviado";
    case "DELIVERED":
      return "Entregado";
    case "READ":
      return "Leído";
    case "FAILED":
      return "Fallido";
    case "BOUNCED":
      return "Rebotado";
    default:
      return exhaustive(s);
  }
}

export function auditActionLabel(a: AuditAction): string {
  switch (a) {
    case "CREATE":
      return "Creó";
    case "UPDATE":
      return "Modificó";
    case "DELETE":
      return "Eliminó";
    case "RESTORE":
      return "Restauró";
    case "LOGIN":
      return "Inició sesión";
    case "LOGOUT":
      return "Cerró sesión";
    case "EXPORT":
      return "Exportó";
    case "PERMISSION_CHANGE":
      return "Cambió permisos";
    default:
      return exhaustive(a);
  }
}
