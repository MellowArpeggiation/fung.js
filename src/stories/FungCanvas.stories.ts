import type { Meta, StoryObj } from '@storybook/react';

import { FungCanvas } from '../components';

// More on how to set up stories at: https://storybook.js.org/docs/react/writing-stories/introduction#default-export
const meta = {
    title: 'FUNG/FungCanvas',
    component: FungCanvas,
    parameters: {
        // Optional parameter to center the component in the Canvas. More info: https://storybook.js.org/docs/react/configure/story-layout
        layout: 'fullscreen',
    },
    // More on argTypes: https://storybook.js.org/docs/react/api/argtypes
    argTypes: {
        fromColor: { control: 'color' },
        toColor: { control: 'color' },
    },
} satisfies Meta<typeof FungCanvas>;

export default meta;
type Story = StoryObj<typeof meta>;


export const Default: Story = {
    args: {
        fromColor: 'lime',
        toColor: 'yellow',
    },
};

export const Neon: Story = {
    args: {
        fromColor: '#FF00FF',
        toColor: '#00FFFF',
    },
};