import { del, get, set } from 'idb-keyval'
import type { AppData } from '../types'

const DATA_KEY = 'internflow-data-v1'

export const loadData = () => get<AppData>(DATA_KEY)
export const saveData = (data: AppData) => set(DATA_KEY, data)
export const clearData = () => del(DATA_KEY)
