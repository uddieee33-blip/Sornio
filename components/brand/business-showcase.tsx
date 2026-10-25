'use client';

import { useState } from 'react';
import { ArrowUpRight, Check, Coffee, Dumbbell, Monitor, Scissors, Shirt, ShoppingBasket, Store, Wrench } from 'lucide-react';

const businesses = [
  { name: 'Grocery', icon: ShoppingBasket, title: 'From the first sale to the last khata entry.', description: 'Billing, shelf stock and customer balances, with the everyday essentials close at hand.', tasks: ['Create a bill', 'Check low stock', 'Collect customer dues'], metric: 'Customer dues', value: '₹3,450', note: 'Across 3 sample customers', colour: 'mint' },
  { name: 'Café & restaurant', icon: Coffee, title: 'Keep the counter moving. And the day in order.', description: 'Bring bills, your menu and pantry stock into the same daily workspace.', tasks: ['Create a food bill', 'Manage menu items', 'Review pantry stock'], metric: 'Bills today', value: '38', note: 'Sample café activity', colour: 'amber' },
  { name: 'Gym', icon: Dumbbell, title: 'More time on the floor. Less time in the register.', description: 'Keep check-ins, memberships and upcoming renewals in focus.', tasks: ['Check in a member', 'Add a membership', 'Review renewals'], metric: 'Member check-ins', value: '64', note: 'Sample gym activity', colour: 'blue' },
  { name: 'Salon', icon: Scissors, title: 'A clearer schedule. A smoother day.', description: 'Stay close to appointments, services and client records, from opening to closing.', tasks: ['Book an appointment', 'Manage services', 'Find a client'], metric: 'Appointments', value: '12', note: 'Sample salon activity', colour: 'mint' },
  { name: 'Electronics', icon: Monitor, title: 'Every product. Every sale. A clearer picture.', description: 'Bring product stock, customer records and service jobs into your working day.', tasks: ['Create a product bill', 'Review stock', 'View service jobs'], metric: 'Sales today', value: '₹24,850', note: 'Sample electronics activity', colour: 'blue' },
  { name: 'Boutique', icon: Shirt, title: 'Keep your collection and your customers connected.', description: 'Work with your catalogue, sales and customer follow-ups in one place.', tasks: ['Create a sale', 'Browse the collection', 'View customers'], metric: 'Bills today', value: '18', note: 'Sample boutique activity', colour: 'amber' },
  { name: 'Services', icon: Wrench, title: 'From the next appointment to the final bill.', description: 'Give appointments, service bills and customer balances a place in your day.', tasks: ['Book an appointment', 'Create a service bill', 'Review balances'], metric: 'Appointments', value: '8', note: 'Sample service activity', colour: 'mint' },
  { name: 'General store', icon: Store, title: 'Your everyday essentials. Ready for business.', description: 'Keep bills, products, customers and expenses together as your business grows.', tasks: ['Create a bill', 'Add a product', 'Record an expense'], metric: 'Money collected', value: '₹21,400', note: 'Sample store activity', colour: 'blue' },
] as const;

/** Marketing examples only; selection never changes the visitor's real business. */
export function BusinessShowcase() {
  const [selected, setSelected] = useState(0);
  const business = businesses[selected];
  return (
    <section id="businesses" className="sornio-container sornio-section sornio-businesses">
      <div className="sornio-section-heading"><div><p className="sornio-eyebrow">DIFFERENT BUSINESSES. ONE SORNIO.</p><h2>Your business has<br /><span>its own rhythm.</span></h2></div><p>Your workspace should follow it. Explore the daily priorities for eight kinds of business.</p></div>
      <div className="sornio-industry-options" aria-label="Choose a business example">{businesses.map((item, index) => <button type="button" key={item.name} aria-pressed={selected === index} aria-controls="sornio-industry-example" onClick={() => setSelected(index)}><item.icon size={17} aria-hidden="true" />{item.name}</button>)}</div>
      <div id="sornio-industry-example" className={`sornio-industry-example sornio-tint-${business.colour}`}>
        <div className="sornio-industry-story" aria-live="polite" aria-atomic="true"><span className="sornio-industry-label"><business.icon size={20} aria-hidden="true" />{business.name} workspace</span><h3>{business.title}</h3><p>{business.description}</p></div>
        <div className="sornio-industry-card"><div><span>YOUR DAILY FOCUS</span><ArrowUpRight size={18} aria-hidden="true" /></div><ul>{business.tasks.map(task => <li key={task}><Check size={16} aria-hidden="true" />{task}</li>)}</ul><div className="sornio-industry-metric"><span>{business.metric}<small>{business.note}</small></span><strong>{business.value}</strong></div><p>Illustrative workspace · sample figures</p></div>
      </div>
    </section>
  );
}
