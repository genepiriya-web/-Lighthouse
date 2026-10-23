import PriceCheck from "./price-check";

// M1 placeholder home: proves the shared logic runs in the browser and on the server with the same result.
// The real screens (Jobs, order sheet, Store, ...) arrive in M4.
export default function Home() {
  return (
    <main className="wrap">
      <PriceCheck />
    </main>
  );
}
