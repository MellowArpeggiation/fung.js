import type { Meta, StoryObj } from '@storybook/react';

import FungContainer from './FungContainer';

// More on how to set up stories at: https://storybook.js.org/docs/react/writing-stories/introduction#default-export
const meta = {
    title: 'FUNG/FungContainer',
    component: FungContainer,
    parameters: {
        // Optional parameter to center the component in the Canvas. More info: https://storybook.js.org/docs/react/configure/story-layout
        layout: 'fullscreen',
    },
    // More on argTypes: https://storybook.js.org/docs/react/api/argtypes
    argTypes: {
        fromColor: { control: 'color' },
        toColor: { control: 'color' },
    },
} satisfies Meta<typeof FungContainer>;

export default meta;
type Story = StoryObj<typeof meta>;


export const Rainbow: Story = {
    
}