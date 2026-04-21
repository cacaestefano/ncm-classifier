import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { zipSync, strToU8 } from 'fflate';
import path from 'node:path';

test('end-to-end import → classify → export', async ({ page }) => {
  await page.goto('/database', { waitUntil: 'networkidle' });

  // Drop NCM file
  const ncmBuf = readFileSync('tests/fixtures/ncm-sample.json');
  await page.setInputFiles('input[type=file][accept=".json"]', {
    name: 'ncm.json', mimeType: 'application/json', buffer: ncmBuf
  });
  await expect(page.getByText('Importado: 4 códigos')).toBeVisible({ timeout: 15000 });

  // Drop attrs zip
  const attrsJson = readFileSync('tests/fixtures/attrs-sample.json');
  const zipBuf = Buffer.from(zipSync({ 'data.json': new Uint8Array(attrsJson) }));
  await page.setInputFiles('input[type=file][accept=".zip"]', {
    name: 'attrs.zip', mimeType: 'application/zip', buffer: zipBuf
  });
  await expect(page.getByText(/Importado: 2 atributos/)).toBeVisible({ timeout: 15000 });

  // Import products (inline mock CSV)
  const csv = 'id,short,long\nP1,Prod 1,Long desc 1';
  await page.goto('/import', { waitUntil: 'networkidle' });
  await page.setInputFiles('input[type=file][accept=".csv,.xlsx"]', {
    name: 'products.csv', mimeType: 'text/csv', buffer: Buffer.from(csv)
  });
  await expect(page.getByText('1 linhas')).toBeVisible();
  await page.getByRole('button', { name: /Continuar/ }).click();

  // Map columns
  await page.locator('select').nth(0).selectOption('id');
  await page.locator('select').nth(1).selectOption('short');
  await page.locator('select').nth(2).selectOption('long');
  await page.getByRole('button', { name: /Importar 1 produtos/ }).click();

  // Classify
  await expect(page).toHaveURL(/\/classify/);
  await page.locator('aside ul li button').first().click();
  await page.getByPlaceholder(/Buscar NCM/).fill('raça');
  await page.locator('.results button').first().click();
  await page.getByRole('button', { name: 'Expandir Atributos' }).click();
  await expect(page.locator('table.attrs tbody tr')).toHaveCount(2);

  // Export
  await page.goto('/export');
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exportar' }).click()
  ]);
  expect(dl.suggestedFilename()).toMatch(/\.xlsx$/);
});
