#!/usr/bin/env node
import { watch, derived, computed, ReactiveState } from '@xec-sh/kit';

// Example: Reactive state with computed values
async function main() {
  // Create reactive state for a shopping cart
  const cart = new ReactiveState({
    items: [
      { name: 'Apple', price: 0.5, quantity: 5 },
      { name: 'Banana', price: 0.3, quantity: 8 },
      { name: 'Orange', price: 0.7, quantity: 3 },
    ],
    taxRate: 0.08,
    discount: 0.1,
  });

  // Create computed values
  const subtotal = computed(cart, get => 
    get('items').reduce((sum, item) => sum + item.price * item.quantity, 0)
  );

  const discountAmount = computed(cart, get => 
    subtotal() * get('discount')
  );

  const taxAmount = computed(cart, get => 
    (subtotal() - discountAmount()) * get('taxRate')
  );

  const total = computed(cart, get => 
    subtotal() - discountAmount() + taxAmount()
  );

  // Create derived state for order summary
  const orderSummary = derived(cart, get => ({
    itemCount: get('items').reduce((sum, item) => sum + item.quantity, 0),
    subtotal: subtotal(),
    discount: discountAmount(),
    tax: taxAmount(),
    total: total(),
  }));

  // Watch for changes
  watch(orderSummary, 'total', (newTotal, oldTotal) => {
    console.log(`Total changed from $${oldTotal.toFixed(2)} to $${newTotal.toFixed(2)}`);
  });

  // Display initial state
  console.log('Shopping Cart Summary:');
  console.log('-'.repeat(30));
  cart.get('items').forEach(item => {
    console.log(`${item.name}: ${item.quantity} × $${item.price} = $${(item.quantity * item.price).toFixed(2)}`);
  });
  console.log('-'.repeat(30));
  console.log(`Subtotal: $${subtotal().toFixed(2)}`);
  console.log(`Discount (${(cart.get('discount') * 100).toFixed(0)}%): -$${discountAmount().toFixed(2)}`);
  console.log(`Tax (${(cart.get('taxRate') * 100).toFixed(0)}%): +$${taxAmount().toFixed(2)}`);
  console.log(`Total: $${total().toFixed(2)}`);

  // Update quantity
  console.log('\nUpdating apple quantity to 10...');
  cart.set('items', items => {
    const newItems = [...items];
    newItems[0] = { ...newItems[0], quantity: 10 };
    return newItems;
  });

  // Update discount
  console.log('Applying 20% discount...');
  cart.set('discount', 0.2);

  // Final summary
  const summary = orderSummary.getState();
  console.log('\nFinal Order Summary:');
  console.log(`Items: ${summary.itemCount}`);
  console.log(`Subtotal: $${summary.subtotal.toFixed(2)}`);
  console.log(`Discount: -$${summary.discount.toFixed(2)}`);
  console.log(`Tax: +$${summary.tax.toFixed(2)}`);
  console.log(`Total: $${summary.total.toFixed(2)}`);
}

main().catch(console.error);