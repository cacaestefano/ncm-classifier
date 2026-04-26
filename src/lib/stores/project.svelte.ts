import { db } from '$lib/db/client';
import { SvelteSet } from 'svelte/reactivity';

export interface ProductRow {
  id: number; unique_id: string; short_desc: string | null; long_desc: string | null;
  extra_1: string | null; extra_2: string | null; extra_3: string | null; extra_4: string | null; extra_5: string | null;
  ncm_code: string | null; ncm_description: string | null;
  attrRowCount?: number;
}

class ProjectStore {
  products = $state<ProductRow[]>([]);
  selectedId = $state<number | null>(null);
  selectedIds = new SvelteSet<number>();

  async load() {
    await db.init();
    this.products = await db.select<ProductRow>(`
      SELECT p.*, (SELECT COUNT(*) FROM project_attr_row r WHERE r.product_id = p.id) as attrRowCount
      FROM project_product p ORDER BY p.id
    `);
  }

  async addMany(rows: Omit<ProductRow, 'id'>[]) {
    await db.init();
    for (const r of rows) {
      await db.exec(
        `INSERT INTO project_product(unique_id, short_desc, long_desc, extra_1, extra_2, extra_3, extra_4, extra_5)
         VALUES (?,?,?,?,?,?,?,?)`,
        [r.unique_id, r.short_desc, r.long_desc, r.extra_1, r.extra_2, r.extra_3, r.extra_4, r.extra_5]
      );
    }
    await this.load();
  }

  async clear() {
    await db.init();
    await db.exec(`DELETE FROM project_attr_row`);
    await db.exec(`DELETE FROM project_product`);
    this.products = [];
    this.selectedId = null;
    this.selectedIds.clear();
  }

  async assignNcm(productId: number, ncm_code: string, ncm_description: string) {
    await db.exec(`UPDATE project_product SET ncm_code=?, ncm_description=? WHERE id=?`,
      [ncm_code, ncm_description, productId]);
    await this.load();
  }

  async assignNcmMany(productIds: number[], ncm_code: string, ncm_description: string) {
    for (const id of productIds) {
      await db.exec(`UPDATE project_product SET ncm_code=?, ncm_description=? WHERE id=?`,
        [ncm_code, ncm_description, id]);
    }
    await this.load();
  }

  async attrRowsFor(productId: number) {
    return db.select<any>(`SELECT * FROM project_attr_row WHERE product_id=? ORDER BY attr_counter`, [productId]);
  }

  async setAttrValue(rowId: number, value: string) {
    await db.exec(`UPDATE project_attr_row SET attr_value=? WHERE id=?`, [value, rowId]);
  }

  async applyAttrValueToProducts(attrCode: string, value: string, productIds: number[]): Promise<number> {
    if (productIds.length === 0) return 0;
    const placeholders = productIds.map(() => '?').join(',');
    await db.exec(
      `UPDATE project_attr_row SET attr_value=? WHERE attr_code=? AND product_id IN (${placeholders})`,
      [value, attrCode, ...productIds]
    );
    const counted = await db.select<{c:number}>(
      `SELECT COUNT(*) as c FROM project_attr_row WHERE attr_code=? AND product_id IN (${placeholders})`,
      [attrCode, ...productIds]
    );
    return counted[0]?.c ?? 0;
  }
}

export const project = new ProjectStore();
