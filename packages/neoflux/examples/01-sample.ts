import { computed } from "../src/computed.js";
import { signal } from "../src/signal.js";

async function main() {
  const counter = signal(0);

  const increment = () => {
    counter.set(counter() + 1);
  };

  const decrement = () => {
    counter.set(counter() - 1);
  };

  const unsubscribe = counter.subscribe((value) => {
    console.log("counter changed", value);
  });

  const counter2 = computed(() => counter() * 2);

  console.log(counter(), counter2());
  increment();
  console.log(counter(), counter2());
  unsubscribe();
  decrement();
  console.log(counter(), counter2());
  counter.bind(1);
  console.log(counter(), counter2());
}

main();