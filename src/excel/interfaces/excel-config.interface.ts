export interface DropdownConfig {
  options: { label: string; value: string }[]
}

export interface ColumnConfig {
  header: string
  key: string
  width?: number
  dropdown?: DropdownConfig
}
