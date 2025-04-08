// src/ReactionSelector.tsx
import React from 'react';
import {
    View,
    TouchableOpacity,
    StyleSheet,
    Modal, // Use Modal for better layering and backdrop handling
    Pressable, // Use Pressable for the backdrop
} from 'react-native';

import { Image } from 'expo-image';

import { ReactionImages } from '../constants/ReactionImages';

type ReactionType = keyof typeof ReactionImages;
const availableReactions: ReactionType[] = ['kekw', 'thumbsup', 'huh', 'huhcat', 'nickyoung', 'surprisedpikachu', 'tomdelonge', 'rookienumbers', 'blink', 'laughing'];

interface ReactionSelectorProps {
    isVisible: boolean;
    position: { x: number; y: number } | null; // Position to render near
    targetHeight?: number; // Height of the element it's attached to (optional, for better positioning)
    onSelectReaction: (reaction: ReactionType) => void;
    onClose: () => void;
}

const REACTION_MENU_HEIGHT = 40; // Approximate height of the reaction bar
const REACTION_MENU_OFFSET = 12; // Space above the message bubble

export const ReactionSelector: React.FC<ReactionSelectorProps> = ({
    isVisible,
    position,
    targetHeight = 0, // Default target height if not provided
    onSelectReaction,
    onClose,
}) => {
    if (!isVisible || !position) {
        return null;
    }

    // Calculate position: Aim to place it above the message bubble
    const menuTop = position.y - REACTION_MENU_HEIGHT - REACTION_MENU_OFFSET;
    // Adjust if it goes off-screen top (simple version: just push it down)
    const finalTop = Math.max(menuTop, 10); // Ensure some minimum top margin

    const menuLeft = position.x; // Align with the start of the message bubble

    const handleReactionSelect = (reaction: ReactionType) => {
        onSelectReaction(reaction);
        onClose(); // Close menu after selection
    };

    return (
        <Modal
            transparent={true}
            visible={isVisible}
            onRequestClose={onClose} // Allow closing with back button on Android
            animationType="fade" // Optional animation
        >
            {/* Backdrop to capture outside taps */}
            <Pressable style={styles.backdrop} onPress={onClose} />

            {/* Positioned Container for the reactions */}
            <View
                style={[
                    styles.reactionContainer,
                    {
                        top: finalTop,
                        left: menuLeft,
                    },
                ]}
                // Prevent backdrop pressable from capturing taps on the container
                onStartShouldSetResponder={() => true}
            >
                {availableReactions.map((reactionId) => (
                    <TouchableOpacity
                        key={reactionId}
                        onPress={() => handleReactionSelect(reactionId)}
                        style={styles.reactionButton}
                        hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }} // Increase tap area
                    >
                        <Image
                            source={ReactionImages[reactionId]}
                            style={styles.reactionImage}
                        />
                    </TouchableOpacity>
                ))}
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject, // Cover entire screen
        backgroundColor: 'rgba(0, 0, 0, 0.2)', // Semi-transparent backdrop
    },
    reactionContainer: {
        position: 'absolute',
        flexDirection: 'row',
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        paddingVertical: 4,
        paddingHorizontal: 8,
        // Add shadow for elevation effect
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5, // for Android
        alignItems: 'center',
        height: REACTION_MENU_HEIGHT,
    },
    reactionButton: {
        paddingHorizontal: 6, // Spacing around each image button
    },
    reactionImage: {
        width: 28, // Slightly larger for easier tapping
        height: 28,
    },
});
