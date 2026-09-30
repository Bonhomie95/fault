import assert from 'node:assert/strict';
import { it } from 'node:test';
import { containsStoryDisclosure } from '../src/domain/storyPolicy.js';
import { SEED_CASES } from '../src/services/seedCases.js';

it('keeps story disclosures and true-story claims out of cases', () => {
  for (const text of ['Based on a true story', 'This case is fictional',
    'All characters are fictional', 'As an AI, I cannot', 'AI-generated story']) {
    assert.equal(containsStoryDisclosure(text), true, text);
  }
  for (const c of SEED_CASES) assert.equal(containsStoryDisclosure(JSON.stringify(c)), false);
  assert.equal(containsStoryDisclosure('The witness said the story was untrue.'), false);
});
