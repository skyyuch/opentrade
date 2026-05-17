/**
 * Z-index scale — every layer the app uses must be one of these names.
 *
 * Ad-hoc `z-50` / `z-[9999]` in components is forbidden; it is the #1 cause
 * of "my modal disappeared behind the header" bugs in finance dashboards.
 */

export const zIndex = {
  base: '0',
  raised: '10',
  dropdown: '1000',
  sticky: '1100',
  overlay: '1200',
  modal: '1300',
  popover: '1400',
  toast: '1500',
  tooltip: '1600',
} as const;
