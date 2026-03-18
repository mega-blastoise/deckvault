import React from 'react';
import type { Meta, StoryObj } from '@storybook/react-webpack5';
import { CardGrid } from './CardGrid';
import type { Pokemon } from '@pokemon/clients';
import './CardGrid.css';

const createMockCard = (
  id: string,
  name: string,
  type: string,
  hp: string,
  rarity: string
): Pokemon.Card => ({
  id,
  name,
  supertype: 'Pokémon',
  subtypes: ['Basic'],
  hp,
  types: [type],
  evolvesTo: [],
  rules: [],
  attacks: [],
  weaknesses: [],
  resistances: [],
  retreatCost: [],
  convertedRetreatCost: 1,
  set: {
    id: 'base1',
    name: 'Base Set',
    series: 'Base',
    printedTotal: 102,
    total: 102,
    releaseDate: '1999/01/09',
    updatedAt: '2020/08/14 09:35:00',
    images: {
      symbol: 'https://images.pokemontcg.io/base1/symbol.png',
      logo: 'https://images.pokemontcg.io/base1/logo.png'
    },
    legalities: {}
  },
  number: 1,
  artist: 'Artist Name',
  rarity,
  nationalPokedexNumbers: ['1'],
  legalities: {
    unlimited: 'Legal',
    expanded: 'Legal'
  },
  images: {
    small: `https://images.pokemontcg.io/base1/${id}.png`,
    large: `https://images.pokemontcg.io/base1/${id}_hires.png`
  }
});

const mockCards: Pokemon.Card[] = [
  createMockCard('1', 'Charizard', 'Fire', '120', 'Rare Holo'),
  createMockCard('2', 'Blastoise', 'Water', '100', 'Rare Holo'),
  createMockCard('3', 'Venusaur', 'Grass', '100', 'Rare Holo'),
  createMockCard('4', 'Pikachu', 'Lightning', '60', 'Common'),
  createMockCard('5', 'Mewtwo', 'Psychic', '70', 'Rare'),
  createMockCard('6', 'Dragonite', 'Colorless', '100', 'Rare Holo'),
  createMockCard('7', 'Alakazam', 'Psychic', '80', 'Rare'),
  createMockCard('8', 'Machamp', 'Fighting', '100', 'Rare Holo')
];

const meta: Meta<typeof CardGrid> = {
  title: 'Dashboard/CardGrid',
  component: CardGrid,
  tags: ['autodocs'],
  argTypes: {
    columns: {
      control: 'select',
      options: ['auto', 2, 3, 4, 5]
    },
    loading: {
      control: 'boolean'
    }
  }
};

export default meta;
type Story = StoryObj<typeof CardGrid>;

export const Default: Story = {
  args: {
    cards: mockCards
  }
};

export const TwoColumns: Story = {
  args: {
    cards: mockCards,
    columns: 2
  }
};

export const ThreeColumns: Story = {
  args: {
    cards: mockCards,
    columns: 3
  }
};

export const FourColumns: Story = {
  args: {
    cards: mockCards,
    columns: 4
  }
};

export const WithSelection: Story = {
  args: {
    cards: mockCards,
    selectedCardIds: ['1', '3', '5'],
    onCardSelect: (card) => {
      console.log('Selected:', card.name);
    }
  }
};

export const Loading: Story = {
  args: {
    cards: [],
    loading: true
  }
};

export const Empty: Story = {
  args: {
    cards: [],
    emptyMessage: 'No Pokemon cards in your collection yet'
  }
};

export const FewCards: Story = {
  args: {
    cards: mockCards.slice(0, 3)
  }
};

export const Interactive: Story = {
  render: () => {
    const [selectedIds, setSelectedIds] = React.useState<string[]>([]);

    const handleSelect = (card: Pokemon.Card) => {
      setSelectedIds((prev) =>
        prev.includes(card.id)
          ? prev.filter((id) => id !== card.id)
          : [...prev, card.id]
      );
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
          <strong>Selected:</strong> {selectedIds.length} cards
        </div>
        <CardGrid
          cards={mockCards}
          selectedCardIds={selectedIds}
          onCardSelect={handleSelect}
        />
      </div>
    );
  }
};
