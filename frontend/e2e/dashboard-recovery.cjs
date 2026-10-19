const assert = require('node:assert/strict');

// Shared by the real-stack CI suite and the local fixture-only browser suite.
async function verifyDashboardRecovery(page, web, api) {
  const resources = [
    { endpoint: '/enrollments/my', label: 'Белсенді курс' },
    { endpoint: '/attempts/my', label: 'Емтихан' },
    { endpoint: '/certificates/my', label: 'Сертификат' },
  ];
  const stat = resource => page.locator('.workspace-stat').filter({ has: page.getByText(resource.label, { exact: true }) });
  const continueLinks = () => page.locator('section[aria-labelledby="continue-title"] a').evaluateAll(links => links.map(link => link.getAttribute('href')));
  await page.goto(`${web}/dashboard`);
  const baseline = new Map();
  for (const resource of resources) {
    await stat(resource).locator('.workspace-stat-value').waitFor();
    baseline.set(resource.endpoint, await stat(resource).locator('.workspace-stat-value').innerText());
  }
  const baselineLinks = await continueLinks();
  assert.ok(baselineLinks.length > 0, 'Continue learning or choose course must be available');

  for (const failed of resources) {
    const target = new URL(`${api}${failed.endpoint}`);
    const matches = url => url.origin === target.origin && url.pathname === target.pathname;
    let fail = true;
    let intercepted = 0;
    const intercept = async route => {
      intercepted += 1;
      if (fail) await route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"unavailable"}' });
      else await route.fallback(); // Preserve the fixture handler in the local suite.
    };
    await page.route(matches, intercept);
    try {
      await page.goto(`${web}/dashboard`);
      const failedStat = stat(failed);
      await failedStat.getByText('Күйі белгісіз', { exact: true }).waitFor();
      assert.ok(intercepted > 0, 'The intended API request must actually fail');
      assert.equal(await failedStat.locator('.workspace-stat-value').count(), 0, 'Unavailable must not appear as zero');
      for (const healthy of resources.filter(resource => resource !== failed)) {
        await stat(healthy).locator('.workspace-stat-value').waitFor();
        assert.equal(await stat(healthy).locator('.workspace-stat-value').innerText(), baseline.get(healthy.endpoint));
      }
      if (failed.endpoint === '/enrollments/my') {
        await page.getByRole('alert').filter({ hasText: 'Курс деректерін жүктеу мүмкін болмады.' }).waitFor();
        assert.equal(await page.getByRole('heading', { name: 'Оқуды бастаңыз!', exact: true }).count(), 0);
      } else {
        assert.deepEqual(await continueLinks(), baselineLinks, 'Other API failures must preserve course navigation');
      }
      fail = false;
      const beforeRetry = intercepted;
      await failedStat.getByRole('button', { name: 'Қайта көру', exact: true }).click();
      await failedStat.locator('.workspace-stat-value').waitFor();
      assert.ok(intercepted > beforeRetry, 'Retry must request the failed resource again');
      assert.equal(await failedStat.locator('.workspace-stat-value').innerText(), baseline.get(failed.endpoint));
      assert.equal(await failedStat.getByText('Күйі белгісіз', { exact: true }).count(), 0);
      assert.deepEqual(await continueLinks(), baselineLinks, 'Course navigation must recover');
    } finally {
      await page.unroute(matches, intercept);
    }
  }
}

module.exports = { verifyDashboardRecovery };
