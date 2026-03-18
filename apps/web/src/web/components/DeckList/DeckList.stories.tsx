import React from 'react';
import type { Meta, StoryObj } from '@storybook/react-webpack5';
import { DeckList } from './DeckList';
import type { Deck } from '../DeckCard/types';
import './DeckList.css';

const mockDecks: Deck[] = [
  {
    id: '1',
    name: 'Fire Deck',
    description:
      'A powerful fire-type deck featuring Charizard and other fire Pokemon.',
    cardCount: 60,
    lastModified: '2026-01-05',
    isValid: true,
    coverCard: {
      id: 'base1-4',
      name: 'Charizard',
      imageUrl: 'https://images.pokemontcg.io/base1/4.png'
    }
  },
  {
    id: '2',
    name: 'Water Control',
    description: 'Strategic water-type deck focused on energy manipulation.',
    cardCount: 58,
    lastModified: '2026-01-03',
    isValid: true,
    coverCard: {
      id: 'base1-2',
      name: 'Blastoise',
      imageUrl: 'https://images.pokemontcg.io/base1/2.png'
    }
  },
  {
    id: '3',
    name: 'Work In Progress',
    description: 'Building a grass-type deck.',
    cardCount: 45,
    lastModified: '2026-01-08',
    isValid: false
  },
  {
    id: '4',
    name: 'Lightning Fast',
    description: 'Speed-focused electric deck with Pikachu evolution line.',
    cardCount: 60,
    lastModified: '2026-01-02',
    isValid: true,
    coverCard: {
      id: 'base1-58',
      name: 'Pikachu',
      imageUrl: 'https://images.pokemontcg.io/base1/58.png'
    }
  },
  {
    id: '5',
    name: 'Psychic Power',
    description: 'Control-oriented psychic deck with Alakazam.',
    cardCount: 60,
    lastModified: '2025-12-28',
    isValid: true
  }
];

const meta: Meta<typeof DeckList> = {
  title: 'Dashboard/DeckList',
  component: DeckList,
  tags: ['autodocs'],
  argTypes: {
    layout: {
      control: 'select',
      options: ['grid', 'list']
    },
    loading: {
      control: 'boolean'
    }
  }
};

export default meta;
type Story = StoryObj<typeof DeckList>;

export const Default: Story = {
  args: {
    decks: mockDecks
  }
};

export const WithCreateButton: Story = {
  args: {
    decks: mockDecks,
    onCreateNew: () => {
      console.log('Create new deck');
    }
  }
};

export const WithSelection: Story = {
  args: {
    decks: mockDecks,
    selectedDeckId: '2',
    onDeckSelect: (deck) => {
      console.log('Selected deck:', deck.name);
    }
  }
};

export const ListLayout: Story = {
  args: {
    decks: mockDecks,
    layout: 'list',
    onCreateNew: () => {
      console.log('Create new deck');
    }
  }
};

export const Empty: Story = {
  args: {
    decks: [],
    onCreateNew: () => {
      console.log('Create new deck');
    }
  }
};

export const Loading: Story = {
  args: {
    decks: [],
    loading: true
  }
};

export const FewDecks: Story = {
  args: {
    decks: mockDecks.slice(0, 2),
    onCreateNew: () => {
      console.log('Create new deck');
    }
  }
};

export const Interactive: Story = {
  render: () => {
    const [decks, setDecks] = React.useState(mockDecks);
    const [selectedId, setSelectedId] = React.useState<string | null>(null);

    const handleCreate = () => {
      const newDeck: Deck = {
        id: `${Date.now()}`,
        name: `New Deck ${decks.length + 1}`,
        description: 'A newly created deck',
        cardCount: 0,
        lastModified: new Date().toISOString().split('T')[0],
        isValid: false
      };
      setDecks([...decks, newDeck]);
    };

    const handleDelete = (deck: Deck) => {
      if (window.confirm(`Delete deck "${deck.name}"?`)) {
        setDecks(decks.filter((d) => d.id !== deck.id));
        if (selectedId === deck.id) {
          setSelectedId(null);
        }
      }
    };

    return (
      <div>
        <div
          style={{
            marginBottom: '1rem',
            padding: '1rem',
            backgroundColor: '#F7FAFC',
            borderRadius: '8px'
          }}
        >
          <strong>Selected Deck:</strong>{' '}
          {selectedId ? decks.find((d) => d.id === selectedId)?.name : 'None'}
          <br />
          <strong>Total Decks:</strong> {decks.length}
        </div>
        <DeckList
          decks={decks}
          selectedDeckId={selectedId || undefined}
          onDeckSelect={(deck) => setSelectedId(deck.id)}
          onDeckEdit={(deck) => console.log('Edit:', deck.name)}
          onDeckDelete={handleDelete}
          onCreateNew={handleCreate}
        />
      </div>
    );
  }
};
