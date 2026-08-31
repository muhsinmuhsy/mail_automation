import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DataTable } from '@/components/ui/DataTable';

interface Row {
  id: number;
  name: string;
}

const columns = [
  { key: 'id', header: 'ID' },
  { key: 'name', header: 'Name' },
];

describe('DataTable', () => {
  it('renders all column headers', () => {
    render(<DataTable<Row> data={[{ id: 1, name: 'a' }]} columns={columns} />);
    expect(screen.getByText('ID')).toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
  });

  it('renders rows using the raw value when no render function is given', () => {
    render(<DataTable<Row> data={[{ id: 1, name: 'Alice' }]} columns={columns} />);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('renders a "No data" row when the data array is empty', () => {
    render(<DataTable<Row> data={[]} columns={columns} />);
    const cell = screen.getByText('No data');
    expect(cell).toBeInTheDocument();
    expect(cell).toHaveAttribute('colspan', '2');
  });

  it('uses a render function when provided', () => {
    const cols = [{ key: 'name', header: 'Name', render: (item: Row) => <strong>{item.name}</strong> }];
    render(<DataTable<Row> data={[{ id: 1, name: 'Bob' }]} columns={cols} />);
    expect(screen.getByText('Bob').tagName).toBe('STRONG');
  });

  it('renders multiple rows', () => {
    render(
      <DataTable<Row>
        data={[
          { id: 1, name: 'a' },
          { id: 2, name: 'b' },
        ]}
        columns={columns}
      />
    );
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('b')).toBeInTheDocument();
  });
});
