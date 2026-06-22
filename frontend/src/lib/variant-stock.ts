// DEPRECATED (миграция «1 карточка = 1 товар», этап 4): ProductVariant удалён,
// остаток живёт только на Product.totalStock. Функция оставлена как NO-OP, чтобы не
// трогать 5 call-sites (orders/kaspi-sync/satu-sync/ba3ar) — они продолжают её звать,
// но больше ничего не зеркалят. Удалить вызовы и эту функцию можно отдельной зачисткой.
export async function mirrorSingleVariantStock(
  _productId: string,
  _client?: unknown,
): Promise<void> {
  // no-op: источник истины остатка — Product.totalStock, варианта больше нет.
}
