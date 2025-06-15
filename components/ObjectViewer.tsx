
import React from 'react';

interface ObjectViewerProps {
  data: any;
  initialIndent?: boolean;
}

const isObject = (value: any): value is object => typeof value === 'object' && value !== null && !Array.isArray(value);

const renderValue = (value: any, keyPrefix: string, indentLevel: number): React.ReactNode => {
  const indentClass = indentLevel > 0 ? `ml-${Math.min(indentLevel * 2, 12)} pl-2` : ''; // Max indent ml-12 for deep objects
  const borderClass = indentLevel > 0 ? 'border-l border-gray-300 dark:border-gray-600' : '';

  if (value === null) {
    return <span className="text-gray-500 dark:text-gray-400">null</span>;
  }
  if (typeof value === 'string') {
    return <span className="text-green-600 dark:text-green-400">"{value}"</span>;
  }
  if (typeof value === 'number') {
    return <span className="text-blue-600 dark:text-blue-400">{value}</span>;
  }
  if (typeof value === 'boolean') {
    return <span className="text-purple-600 dark:text-purple-400">{String(value)}</span>;
  }
  
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-gray-500 dark:text-gray-400">[]</span>;
    return (
      <div className={`${indentClass} ${borderClass}`}>
        <span className="text-gray-500 dark:text-gray-400">[</span>
        {value.map((item, index) => (
          <div key={`${keyPrefix}-${index}`} className="ml-2">
            {renderValue(item, `${keyPrefix}-${index}`, indentLevel + 1)}
            {index < value.length - 1 && <span className="text-gray-500 dark:text-gray-400">,</span>}
          </div>
        ))}
        <span className="text-gray-500 dark:text-gray-400">]</span>
      </div>
    );
  }
  
  if (isObject(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) return <span className="text-gray-500 dark:text-gray-400">&#123;&#125;</span>;
    return (
      <div className={`${indentClass} ${borderClass}`}>
        <span className="text-gray-500 dark:text-gray-400">&#123;</span>
        {entries.map(([key, val], index) => (
          <div key={`${keyPrefix}-${key}`} className="ml-2">
            <span className="font-medium text-red-600 dark:text-red-400">"{key}"</span>
            <span className="text-gray-500 dark:text-gray-400">: </span>
            {renderValue(val, `${keyPrefix}-${key}`, indentLevel + 1)}
            {index < entries.length - 1 && <span className="text-gray-500 dark:text-gray-400">,</span>}
          </div>
        ))}
        <span className="text-gray-500 dark:text-gray-400">&#125;</span>
      </div>
    );
  }
  return null;
};

export const ObjectViewer: React.FC<ObjectViewerProps> = ({ data, initialIndent = false }) => {
  if (data === undefined) return null;
  return (
    <div className="font-mono text-sm bg-gray-100 dark:bg-gray-800 p-3 rounded-md shadow-inner overflow-x-auto">
      {renderValue(data, 'root', initialIndent ? 1 : 0)}
    </div>
  );
};
