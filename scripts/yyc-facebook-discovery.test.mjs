import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const FACEBOOK = 'https://www.facebook.com/profile.php?id=61595441857798';
const index = read('index.html');
const about = read('about.html');
const contact = read('contact.html');
const app = read('app.js');

function jsonLdDocuments(html) {
  return [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => JSON.parse(match[1]));
}
function organizationFrom(html) {
  for (const document of jsonLdDocuments(html)) {
    const graph = Array.isArray(document['@graph']) ? document['@graph'] : [document];
    const organization = graph.find((entity) =>
      entity && (entity['@type'] === 'Organization' ||
      (Array.isArray(entity['@type']) && entity['@type'].includes('Organization')))
    );
    if (organization) return organization;
  }
  return null;
}

test('Homepage Organization structured data declares the exact official Facebook URL', () => {
  const organization = organizationFrom(index);
  assert.ok(organization, 'Homepage should provide Organization structured data.');
  assert.ok(Array.isArray(organization.sameAs), 'Organization.sameAs must be an array.');
  assert.ok(organization.sameAs.includes(FACEBOOK), 'The official Facebook profile must be included in sameAs.');
});

test('About and Contact organization entities use the same official Facebook identity', () => {
  for (const [label, page] of [['About', about], ['Contact', contact]]) {
    const organization = organizationFrom(page);
    assert.ok(organization, label + ' page should provide Organization structured data.');
    assert.ok(organization.sameAs.includes(FACEBOOK), label + ' Organization.sameAs should include the official Facebook URL.');
  }
});

test('Homepage exposes crawlable official Facebook links in the footer and social icons', () => {
  assert.ok(index.includes('<a href="' + FACEBOOK + '" target="_blank" rel="me noopener noreferrer">YYC on Facebook ↗</a>'));
  assert.ok(app.includes("href=\u0027" + FACEBOOK + "\u0027"));
  assert.ok(app.includes('assets/social-facebook.png'));
  assert.ok(app.includes('rel="me noopener noreferrer"'));
});

test('Contact and About pages contain visible official Facebook links', () => {
  assert.ok(contact.includes('<a class="contact-item" href="' + FACEBOOK + '" target="_blank" rel="me noopener noreferrer">'));
  assert.ok(contact.includes('<strong>Facebook</strong>'));
  assert.ok(about.includes('<a href="' + FACEBOOK + '" target="_blank" rel="me noopener noreferrer">Facebook</a>'));
});

test('Changed app script gets a fresh URL so browsers fetch the new official social link', () => {
  assert.ok(index.includes('app.js?v=20261014-02-qr-attendance&google-signin=20261019-02-member-registration&facebook-seo=20261022-01'));
});

test('Official social links open safely in a new tab', () => {
  assert.ok(index.includes('<a href="' + FACEBOOK + '" target="_blank" rel="me noopener noreferrer">YYC on Facebook'));
  assert.ok(contact.includes('href="' + FACEBOOK + '" target="_blank" rel="me noopener noreferrer"'));
});
