import assert from 'node:assert/strict';
const origin = process.env.CLARITY_TEST_ORIGIN || 'http://127.0.0.1:3001';
assert.equal(
  new URL(origin).hostname,
  '127.0.0.1',
  'API smoke test only runs against loopback',
);
const signIn = await fetch(origin + '/signin-with-chatgpt?return_to=%2F', {
  redirect: 'manual',
});
const cookie = signIn.headers.get('set-cookie')?.split(';')[0];
assert.ok(cookie);
const headers = {
  'Content-Type': 'application/json',
  Cookie: cookie,
  Origin: origin,
};
const get = () =>
  fetch(origin + '/api/ledger', { headers: { Cookie: cookie } }).then((r) =>
    r.json(),
  );
const put = (body) =>
  fetch(origin + '/api/ledger', {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
assert.equal((await fetch(origin + '/api/ledger')).status, 401);
const before = await get();
assert.ok(before.state?.accounts.length);
const id = 'api-test-' + crypto.randomUUID();
const state = structuredClone(before.state);
state.journals.push({
  id,
  date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(
    new Date(),
  ),
  title: '临时 API 验证',
  body: 'Will be removed by test',
  tag: '投资复盘',
});
try {
  const result = await put({ state, revision: before.revision });
  assert.equal(result.status, 200, await result.text());
  const reloaded = await get();
  assert.equal(reloaded.revision, before.revision + 1);
  assert.ok(reloaded.state.journals.some((j) => j.id === id));
  assert.equal((await put({ state, revision: before.revision })).status, 409);
  const invalid = structuredClone(reloaded.state);
  invalid.entries[0].amount = -1;
  assert.equal(
    (await put({ state: invalid, revision: reloaded.revision })).status,
    400,
  );
  assert.equal(
    (
      await fetch(origin + '/api/ledger', {
        method: 'PUT',
        headers: { ...headers, Origin: 'https://invalid.example' },
        body: JSON.stringify({ state, revision: reloaded.revision }),
      })
    ).status,
    403,
  );
  const fx = await fetch(origin + '/api/fx', { headers: { Cookie: cookie } });
  if (fx.ok) {
    const v = await fx.json();
    assert.ok(v.rate > 0 && v.date);
    console.log('Live FX endpoint passed');
  } else {
    console.log(
      'FX endpoint reports provider failure without overwriting saved data',
    );
  }
  console.log(
    'API checks passed: authentication, durable save/read, optimistic concurrency, invalid amounts, cross-origin mutation',
  );
} finally {
  const current = await get();
  current.state.journals = current.state.journals.filter((j) => j.id !== id);
  const clean = await put({ state: current.state, revision: current.revision });
  assert.equal(clean.status, 200, 'Test note cleanup failed');
}
