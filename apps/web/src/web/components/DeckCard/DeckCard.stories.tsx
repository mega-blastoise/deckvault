import React from 'react';
import type { Meta, StoryObj } from '@storybook/react-webpack5';
import { DeckCard } from './DeckCard';
import type { Deck } from './types';
import './DeckCard.css';

const mockDeck: Deck = {
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
};

const mockWaterDeck: Deck = {
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
};

const mockIncompleteDeck: Deck = {
  id: '3',
  name: 'Work In Progress',
  description: 'Building a grass-type deck.',
  cardCount: 45,
  lastModified: '2026-01-08',
  isValid: false
};

const meta: Meta<typeof DeckCard> = {
  title: 'Dashboard/DeckCard',
  component: DeckCard,
  tags: ['autodocs'],
  argTypes: {
    selected: {
      control: 'boolean'
    }
  }
};

export default meta;
type Story = StoryObj<typeof DeckCard>;

export const Default: Story = {
  args: {
    deck: mockDeck
  }
};

export const WithoutCover: Story = {
  args: {
    deck: mockIncompleteDeck
  }
};

export const Selected: Story = {
  args: {
    deck: mockDeck,
    selected: true
  }
};

export const Invalid: Story = {
  args: {
    deck: mockIncompleteDeck
  }
};

export const WithActions: Story = {
  args: {
    deck: mockDeck,
    onSelect: (deck) => {
      console.log('Selected deck:', deck.name);
    },
    onEdit: (deck) => {
      console.log('Edit deck:', deck.name);
    },
    onDelete: (deck) => {
      console.log('Delete deck:', deck.name);
    }
  }
};

export const MultipleDecks: Story = {
  render: () => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: '1rem'
      }}
    >
      <DeckCard deck={mockDeck} />
      <DeckCard deck={mockWaterDeck} />
      <DeckCard deck={mockIncompleteDeck} />
    </div>
  )
};

export const Interactive: Story = {
  render: () => {
    const [selectedId, setSelectedId] = React.useState<string | null>(null);
    const [decks, setDecks] = React.useState([
      mockDeck,
      mockWaterDeck,
      mockIncompleteDeck
    ]);

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
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '1rem'
          }}
        >
          {decks.map((deck) => (
            <DeckCard
              key={deck.id}
              deck={deck}
              selected={deck.id === selectedId}
              onSelect={(d) => setSelectedId(d.id)}
              onEdit={(d) => console.log('Edit:', d.name)}
              onDelete={handleDelete}
            />
          ))}
        </div>
      </div>
    );
  }
};
