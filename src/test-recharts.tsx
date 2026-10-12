import React from 'react';
import { createRoot } from 'react-dom/client';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from 'recharts';

const data = Array.from({length: 8000}).map((_, i) => ({ value: Math.random() * 100 }));

function App() {
  return (
    <div style={{width: 800, height: 400}}>
      <ResponsiveContainer>
        <LineChart data={data}>
          <XAxis />
          <YAxis />
          <Line type="monotone" dataKey="value" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

const root = createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);
