export const CUSTOMER_IDENTITY_LABELS: Record<string, string> = {
  designer: '設計師',
  homeowner: '屋主',
  dealer: '建材行',
  contractor: '工班',
  unknown: '未分類',
};

export const SALES_STAGE_LABELS: Record<string, string> = {
  initial: '初步接觸',
  evaluating: '評估中',
  quoted: '已報價',
  won: '已成交',
  lost: '已流失',
};

export function formatCustomerIdentity(value: string | null | undefined): string {
  if (!value) return '未分類';
  return CUSTOMER_IDENTITY_LABELS[value] || value;
}

export function formatSalesStage(value: string | null | undefined): string {
  if (!value) return '';
  return SALES_STAGE_LABELS[value] || value;
}
