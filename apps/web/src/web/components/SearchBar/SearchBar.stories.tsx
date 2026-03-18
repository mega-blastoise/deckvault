import React from 'react';
import type { Meta, StoryObj } from '@storybook/react-webpack5';
import { SearchBar } from './SearchBar';
import type { SearchFilters } from './types';
import './SearchBar.css';

const meta: Meta<typeof SearchBar> = {
  title: 'Dashboard/SearchBar',
  component: SearchBar,
  tags: ['autodocs'],
  argTypes: {
    showFilters: {
      control: 'boolean'
    },
    loading: {
      control: 'boolean'
    }
  }
};

export default meta;
type Story = StoryObj<typeof SearchBar>;

export const Default: Story = {
  args: {
    onSearch: (filters: SearchFilters) => {
      console.log('Search:', filters);
    }
  }
};

export const WithFilters: Story = {
  args: {
    onSearch: (filters: SearchFilters) => {
      console.log('Search:', filters);
    },
    showFilters: true
  }
};

export const WithoutFilters: Story = {
  args: {
    onSearch: (filters: SearchFilters) => {
      console.log('Search:', filters);
    },
    showFilters: false
  }
};

export const Loading: Story = {
  args: {
    onSearch: (filters: SearchFilters) => {
      console.log('Search:', filters);
    },
    loading: true
  }
};

export const CustomPlaceholder: Story = {
  args: {
    onSearch: (filters: SearchFilters) => {
      console.log('Search:', filters);
    },
    placeholder: 'Find your favorite Pokemon...'
  }
};

export const Interactive: Story = {
  render: () => {
    const [results, setResults] = React.useState<SearchFilters | null>(null);
    const [isSearching, setIsSearching] = React.useState(false);

    const handleSearch = (filters: SearchFilters) => {
      setIsSearching(true);
      setTimeout(() => {
        setResults(filters);
        setIsSearching(false);
      }, 1000);
    };

    return (
      <div>
        <SearchBar onSearch={handleSearch} loading={isSearching} />
        {results && (
          <div
            style={{
              marginTop: '1rem',
              padding: '1rem',
              backgroundColor: '#F7FAFC',
              borderRadius: '8px'
            }}
          >
            <h4 style={{ margin: '0 0 0.5rem 0' }}>Search Results:</h4>
            <pre style={{ margin: 0, fontSize: '0.875rem' }}>
              {JSON.stringify(results, null, 2)}
            </pre>
          </div>
        )}
      </div>
    );
  }
};
