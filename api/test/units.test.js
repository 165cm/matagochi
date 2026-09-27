import test from 'node:test';
import assert from 'node:assert/strict';
import { localizeAmount, localizeStep, unitPromptTable } from '../src/units.js';

test('US amounts become Japanese units with the original kept', () => {
  const cases = [
    ['1 cup', '約240ml（1 cup）'], ['1/2 cup', '約120ml（1/2 cup）'], ['1 1/2 cups', '約360ml（1 1/2 cups）'],
    ['2 tbsp', '大さじ2（2 tbsp）'], ['1 tablespoon', '大さじ1（1 tablespoon）'], ['1/2 tsp', '小さじ1/2（1/2 tsp）'],
    ['1½ tsp', '小さじ1と1/2（1½ tsp）'], ['8 oz', '約225g（8 oz）'], ['1 lb', '約455g（1 lb）'], ['2 lbs', '約910g（2 lbs）'],
    ['1 stick', '約115g（1 stick）'], ['2 inches', '約5cm（2 inches）'], ['350°F', '175℃（350°F）'],
    ['pinch', '少々'], ['to taste', '適量'], ['3 cloves', '3かけ'], ['1 can', '1缶'],
    ['200g', '200g'], ['大さじ2', '大さじ2'], ['適量', '適量'], ['2個', '2個'], ['100 ml', '100ml'],
  ];
  for (const [from, to] of cases) assert.equal(localizeAmount(from), to, from);
});

test('temperatures in steps are converted; the prompt carries the table', () => {
  assert.equal(localizeStep('Bake at 400°F for 20 minutes'), 'Bake at 205℃（400°F） for 20 minutes');
  assert.match(unitPromptTable(), /1 cup=240ml/);
  assert.equal(localizeAmount('1 cup', 'en-US'), '1 cup', 'other destinations are left as written for now');
});
