import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import type { Cheque } from '@/lib/types'

// Troca de cheque (desconto): `valor` é o valor do cheque, recebido de uma
// vez no vencimento. Os juros (taxa_juros % do cheque) são descontados na
// hora — o cliente recebe valor − juros. Ex.: cheque de 40.000 a 20% →
// juros 8.000, entrega 32.000. Juros fixos: não renova por período nem gera
// mora, então nada fica "atrasado" antes do vencimento.

export const DIAS_ALERTA_CHEQUE = 7

export type SituacaoCheque = 'aguardando' | 'vence_em_breve' | 'vence_hoje' | 'vencido' | 'devolvido' | 'compensado'

export function hojeLocal(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

export function jurosCheque(c: Pick<Cheque, 'valor' | 'taxa_juros'>): number {
  return Math.round(c.valor * c.taxa_juros) / 100
}

// quanto saiu do caixa na troca (capital que volta quando compensar)
export function entregueCheque(c: Pick<Cheque, 'valor' | 'taxa_juros'>): number {
  return Math.round((c.valor - jurosCheque(c)) * 100) / 100
}

export function diasParaVencer(c: Pick<Cheque, 'data_vencimento'>, hoje: string): number {
  return differenceInCalendarDays(parseISO(c.data_vencimento), parseISO(hoje))
}

export function situacaoCheque(c: Pick<Cheque, 'status' | 'data_vencimento'>, hoje: string): SituacaoCheque {
  if (c.status === 'compensado') return 'compensado'
  if (c.status === 'devolvido') return 'devolvido'
  const dias = diasParaVencer(c, hoje)
  if (dias < 0) return 'vencido'
  if (dias === 0) return 'vence_hoje'
  if (dias <= DIAS_ALERTA_CHEQUE) return 'vence_em_breve'
  return 'aguardando'
}

export const SITUACAO_CHEQUE_INFO: Record<SituacaoCheque, { label: string; color: string; urgente: boolean }> = {
  aguardando:     { label: 'A compensar',    color: 'var(--primary)',     urgente: false },
  vence_em_breve: { label: 'Vence em breve', color: 'var(--color-warning)', urgente: true },
  vence_hoje:     { label: 'Vence hoje',     color: 'var(--destructive)', urgente: true },
  vencido:        { label: 'Vencido',        color: 'var(--destructive)', urgente: true },
  devolvido:      { label: 'Devolvido',      color: 'var(--destructive)', urgente: true },
  compensado:     { label: 'Compensado',     color: '#00e5cc',            urgente: false },
}
