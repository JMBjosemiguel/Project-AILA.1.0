import Card from '../common/Card';
import { SkeletonList } from '../common/Skeleton';
import EmptyState from '../common/EmptyState';

export default function DataTable({ columns, rows, rowKey = 'id', loading, emptyState, onRowClick, footer }) {
  if (loading) {
    return (
      <Card padded={false} className="overflow-hidden">
        <div className="p-4">
          <SkeletonList count={5} />
        </div>
      </Card>
    );
  }

  if (!rows?.length) {
    return (
      <Card>
        <EmptyState {...(emptyState || { title: 'Nothing here yet' })} />
      </Card>
    );
  }

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-100 text-xs text-ink-400 uppercase tracking-wide">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 font-semibold whitespace-nowrap ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row[rowKey]}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`border-b border-ink-50 last:border-0 ${onRowClick ? 'cursor-pointer hover:bg-ink-50/60' : ''} transition-colors`}
              >
                {columns.map((col) => (
                  <td key={col.key} className={`px-4 py-3 align-middle ${col.align === 'right' ? 'text-right' : 'text-left'}`}>
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footer}
    </Card>
  );
}
