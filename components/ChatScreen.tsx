import React, { useState, useRef, useCallback } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    FlatList,
    StyleSheet,
    KeyboardAvoidingView,
    SafeAreaView,
    Keyboard,
    ListRenderItemInfo,
} from 'react-native';
import { Image } from 'expo-image';

import { ReactionImages } from '../constants/ReactionImages';
import { ReactionSelector } from './ReactionSelector';


// --- Type Definitions ---
interface Message {
    id:          string;
    sender:      'user' | 'other';
    timestamp?:  Date;
    reactions?:  ReactionType[];
    type:        'text' | 'gif';
    content:     string;
}

type ReactionType = keyof typeof ReactionImages;

// Simple unique ID generator
const generateId = (): string => Math.random().toString(36).substring(2, 15);

// --- ChatScreen Component ---
const ChatScreen: React.FC = () => {
    // Update initial state to use ReactionType identifiers
    const convoEnd = Date.now();
    const [messages, setMessages] = useState<Message[]>([
        { id: generateId(), type: 'text', content: 'Hello there!', sender: 'other', timestamp: new Date(convoEnd - 132154) },
        { id: generateId(), type: 'text', content: 'Hi! How are you?', sender: 'user', timestamp: new Date(convoEnd - 101854) },
        { id: generateId(), type: 'text', content: 'I am good, thanks! And you?', sender: 'other', timestamp: new Date(convoEnd - 65034) },
        { id: generateId(), type: 'text', content: 'Doing well! Just trying to see what this is all about.', sender: 'user', reactions: ['thumbsup'], timestamp: new Date(convoEnd - 52831) },
        { id: generateId(), type: 'text', content: 'Nice!', sender: 'other', reactions: ['kekw'], timestamp: new Date() },
    ]);
    const [inputText, setInputText] = useState<string>('');
    const flatListRef = useRef<FlatList<Message>>(null);

    // State for Reaction Selector
    const [isReactionSelectorVisible, setReactionSelectorVisible] = useState(false);
    const [currentMessageId, setCurrentMessageId] = useState<string | null>(null);
    const [selectorPosition, setSelectorPosition] = useState<{ x: number; y: number } | null>(null);
    const [selectorTargetHeight, setSelectorTargetHeight] = useState<number>(0);

    // Refs for message bubbles to measure position
    // Use a Map stored in a ref to manage refs for list items
    const messageRefs = useRef<Map<string, View>>(new Map());

    const scrollToEnd = (animated: boolean = true) => {
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated }), 50);
    }

    // --- Message Sending Logic ---
    const handleSend = useCallback((): void => {
        const trimmedInput = inputText.trim();
        if (trimmedInput.length === 0) return;

        let newMessage: Message;

        // Tenor URLs Regex
        const tenorRegex = /(https?:\/\/tenor\.com\/.*view\/[\w-]+-\d+)/i;
        const match = trimmedInput.match(tenorRegex);


        if (match && match[0] === trimmedInput) { // Check if the entire message is the link
            const directGifUrl = match[0] + ".gif";
            console.log("Detected Tenor link, using direct URL:", directGifUrl); // For debugging

            // Create a GIF message
            newMessage = {
                id: generateId(),
                sender: 'user',
                timestamp: new Date(),
                reactions: [],
                type: 'gif',
                content: directGifUrl, // Store the matched URL
            };
        } else {
            // Create a regular text message
            newMessage = {
                id: generateId(),
                sender: 'user',
                timestamp: new Date(),
                reactions: [],
                type: 'text',
                content: trimmedInput, // Store the text
            };
        }

        setMessages((prevMessages: Message[]) => [...prevMessages, newMessage]);
        setInputText('');
        Keyboard.dismiss();
        scrollToEnd();

        // Simulate reply (remains the same, sends a text message)
        setTimeout(() => {
            const replyMessage: Message = {
                id: generateId(),
                sender: 'other',
                timestamp: new Date(),
                reactions: [],
                type: 'text', // Reply is always text in this simulation
                content: `You sent ${newMessage.type === 'gif' ? 'a GIF' : `"${newMessage.content}"`}. Cool!`,
            };
            setMessages((prevMessages: Message[]) => [...prevMessages, replyMessage]);
            scrollToEnd();
        }, 1500);
    }, [inputText]);

    // --- Add Reaction Logic ---
    const handleAddReaction = useCallback((messageId: string, reaction: ReactionType): void => {
        setMessages(prevMessages =>
            prevMessages.map(msg => {
                if (msg.id === messageId) {
                    const currentReactions = msg.reactions || [];
                    if (currentReactions.includes(reaction)) return msg;
                    return { ...msg, reactions: [...currentReactions, reaction] };
                }
                return msg;
            })
        );
        // Close selector is handled by ReactionSelector's onSelectReaction prop now
    }, []);


    // --- Open Reaction Selector ---
    const handleOpenReactions = (messageId: string): void => {
        const node = messageRefs.current.get(messageId);
        if (node) {
            // Measure the position of the message bubble relative to the window/screen
            node.measure((x, y, width, height, pageX, pageY) => {
                console.log(`Measured (${messageId}): x=${x}, y=${y}, w=${width}, h=${height}, px=${pageX}, py=${pageY}`);
                setSelectorPosition({ x: pageX, y: pageY }); // Use pageX, pageY for screen coordinates
                setSelectorTargetHeight(height); // Store height for potential positioning adjustments
                setCurrentMessageId(messageId);
                setReactionSelectorVisible(true);
            });
        } else {
            console.warn(`Could not find ref for messageId: ${messageId}`);
        }
    };

    // --- Close Reaction Selector ---
    const handleCloseReactions = () => {
        setReactionSelectorVisible(false);
        setCurrentMessageId(null);
        setSelectorPosition(null);
        setSelectorTargetHeight(0);
    };

    // --- Action when a reaction is selected in the popup ---
    const onReactionSelected = (reaction: ReactionType) => {
        if (currentMessageId) {
            handleAddReaction(currentMessageId, reaction);
        }
    }

    // Rendering a Single Message Bubble
    const renderMessage = ({ item }: ListRenderItemInfo<Message>): JSX.Element => {
        const isUserMessage: boolean = item.sender === 'user';

        // *** NEW: Determine content based on type ***
        let messageContent: JSX.Element;
        let bubbleStyleOverrides: object = {}; // To adjust bubble style for GIFs

        if (item.type === 'gif') {
            messageContent = (
                <Image
                    source={{ uri: item.content }} // Use the content URL as source
                    style={styles.gifImage}
                    contentFit="contain" // Adjust how the GIF fits
                    // Optional: Add loading indicator/error handling
                    onLoadStart={() => console.log('GIF Loading started:', item.content)}
                    onLoad={() => console.log('GIF Loaded:', item.content)}
                    // onError={(e) => console.error('GIF Load Error:', item.content, e.nativeEvent.error)}
                />
            );
            // Remove padding for GIF bubbles so image fills it better
            bubbleStyleOverrides = { paddingVertical: 0, paddingHorizontal: 0, overflow: 'hidden' };
        } else { // Default to text
            messageContent = (
                <Text style={isUserMessage ? styles.userMessageText : styles.otherMessageText}>
                    {item.content}
                </Text>
            );
            // Standard text padding
            bubbleStyleOverrides = { paddingVertical: 8, paddingHorizontal: 12 };
        }

        return (
            <View
                ref={(node) => {
                    // Store or remove the ref in the Map
                    if (node) {
                        messageRefs.current.set(item.id, node);
                    } else {
                        messageRefs.current.delete(item.id);
                    }
                }}
                // *** Add onLongPress to the outer View ***
                // Use onLongPress on the View instead of TouchableOpacity if preferred,
                // otherwise keep TouchableOpacity and attach ref/onLongPress there.
                // Let's keep TouchableOpacity for visual feedback.
            >
                {item.timestamp && <Text style={styles.timestamp}>{item.timestamp.toLocaleTimeString()}</Text>}
                <TouchableOpacity
                    onLongPress={() => handleOpenReactions(item.id)}
                    activeOpacity={0.8}
                    style={[
                        styles.messageContainer,
                        isUserMessage ? styles.userMessageContainer : styles.otherMessageContainer
                    ]}
                >
                    {/* Apply base bubble styles + type-specific overrides */}
                    <View style={[
                        styles.messageBubbleBase, // *** Use a base style ***
                        isUserMessage ? styles.userMessageBubble : styles.otherMessageBubble,
                        bubbleStyleOverrides, // *** Apply overrides ***
                    ]}>
                        {messageContent} {/* Render text or GIF */}
                    </View>

                    {/* Reactions Display (remains the same) */}
                    {item.reactions && item.reactions.length > 0 && (
                        <View style={styles.reactionsContainer}>
                            {Array.from(new Set(item.reactions)).map((reactionId) => (
                                <Image
                                    key={`${item.id}-reaction-${reactionId}`}
                                    source={ReactionImages[reactionId]}
                                    style={styles.reactionImageDisplay} // Use a different style for *display*
                                />
                            ))}
                        </View>
                    )}
                </TouchableOpacity>
            </View>
        );
    };


    // Main Component Render
    return (
        <SafeAreaView style={styles.safeArea}>
            <KeyboardAvoidingView
                style={styles.keyboardAvoidingContainer}
                behavior={'height'}
                keyboardVerticalOffset={0}
            >
                <FlatList<Message>
                    ref={flatListRef}
                    data={messages}
                    renderItem={renderMessage}
                    keyExtractor={(item: Message) => item.id}
                    style={styles.messageList}
                    contentContainerStyle={styles.messageListContent}
                    onContentSizeChange={() => scrollToEnd(false)}
                    onLayout={() => scrollToEnd(false)}
                    onScrollBeginDrag={handleCloseReactions}
                />

                <View style={styles.inputContainer}>
                    <TextInput
                        style={styles.inputField}
                        value={inputText}
                        onChangeText={setInputText}
                        placeholder="Type a message..."
                        placeholderTextColor="#888"
                        multiline
                    />
                    <TouchableOpacity style={styles.sendButton} onPress={handleSend}>
                        <Text style={styles.sendButtonText}>Send</Text>
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>

            <ReactionSelector
                isVisible={isReactionSelectorVisible}
                position={selectorPosition}
                targetHeight={selectorTargetHeight}
                onSelectReaction={onReactionSelected}
                onClose={handleCloseReactions}
            />
        </SafeAreaView>
    );
};

// Styles
const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#f1ecea',
    },

    keyboardAvoidingContainer: {
        flex: 1
    },

    messageList: {
        flex: 1,
        paddingHorizontal: 10,
    },

    messageListContent: {
        paddingBottom: 10,
        paddingTop: 10,
    },

    messageContainer: {
        marginBottom: 8,
        maxWidth: '80%',
    },

    userMessageContainer: {
        alignSelf: 'flex-end',
    },

    otherMessageContainer: {
        alignSelf: 'flex-start',
    },

    messageBubble: {
        paddingVertical: 8,
        paddingHorizontal: 12,
    },

    // Style for the small reaction images
    reactionImage: {
        width: 20,  // Adjust size as needed
        height: 20, // Adjust size as needed
        marginHorizontal: 2, // Spacing between images
        marginVertical: 1,   // Spacing if they wrap
    },

    // Input Area Styles
    inputContainer: {
        flexDirection:      'row',
        alignItems:         'center',
        paddingHorizontal:  10,
        paddingVertical:    8,
        borderTopWidth:     1,
        borderTopColor:     '#DDD',
        backgroundColor:    '#FFFFFF'
    },

    inputField: {
        flex: 1,
        minHeight: 40,
        maxHeight: 120,
        backgroundColor: '#F5F5F5',
        borderRadius: 20,
        paddingHorizontal: 15,
        paddingVertical: 10,
        fontSize: 16,
        marginRight: 10,
        borderWidth: 1,
        borderColor: '#E0E0E0'
    },
    sendButton: {
        backgroundColor: '#4d4dde',
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 10,
        height: 40,
        justifyContent: 'center'
    },
    sendButtonText: {
        color: '#edfad2',
        fontSize: 16,
        fontWeight: '600'
    },

    // Reactions Display (under bubble)
    reactionsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginTop: -8,
        marginLeft: 10,
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
        borderRadius: 12,
        paddingHorizontal: 4,
        paddingVertical: 2,
        alignSelf: 'flex-start',
        zIndex: 1,
    },

    // Renamed style for displayed reactions
    reactionImageDisplay: {
        width: 20, // Smaller size for display under bubble
        height: 20,
        marginHorizontal: 2,
        marginVertical: 1,
    },

    messageBubbleBase: {
        borderRadius: 18,
    },

    // Specific bubble background/alignment
    userMessageBubble: {
        backgroundColor: '#4d4dde',
        borderRadius: 24,
        borderBottomRightRadius: 4,
    },

    otherMessageBubble: {
        backgroundColor: '#dcdce5',
        borderRadius: 24,
        borderBottomLeftRadius: 4,
    },

    // Text Styles
    userMessageText: { color: '#edfad2', fontSize: 16 },
    otherMessageText: { color: '#2d3028', fontSize: 16 },

    // GIFs Styles
    gifImage: {
        width: 200, // Set a fixed width or make it dynamic
        aspectRatio: 1, // Default aspect ratio (adjust if known, or use resizeMode='contain')
        // Height will be calculated based on width & aspectRatio
        borderRadius: 18, // Match bubble corners if image fills it
    },

    timestamp: {
        fontSize: 10,
        textAlign: 'center',
        marginBottom: 4,
    }
});

export default ChatScreen;
