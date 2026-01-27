import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TextInput,
    ActivityIndicator,
    TouchableOpacity
} from 'react-native';
import { stopsApi } from '../api/api';
import { Theme } from '../theme/Theme';

const StopListScreen = () => {
    const [stops, setStops] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [offset, setOffset] = useState(0);
    const [total, setTotal] = useState(0);

    const fetchStops = async (newSearch = '', reset = false) => {
        setLoading(true);
        try {
            const data = await stopsApi.getStops({
                search: newSearch,
                limit: 50,
                offset: reset ? 0 : offset,
                needsCorrection: true,
            });

            if (reset) {
                setStops(data.stops);
                setOffset(50);
            } else {
                setStops([...stops, ...data.stops]);
                setOffset(offset + 50);
            }
            setTotal(data.total);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStops('', true);
    }, []);

    const handleSearch = (text: string) => {
        setSearch(text);
        // Debounce would be better, but let's keep it simple
        if (text.length > 2 || text.length === 0) {
            fetchStops(text, true);
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.searchBar}>
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search by stop name..."
                    value={search}
                    onChangeText={handleSearch}
                />
            </View>

            <FlatList
                data={stops}
                keyExtractor={(item) => item.stop_id}
                renderItem={({ item }) => (
                    <View style={styles.stopCard}>
                        <View>
                            <Text style={styles.stopName}>{item.stop_name}</Text>
                            <Text style={styles.stopId}>ID: {item.stop_id}</Text>
                        </View>
                        <View style={styles.statusBadge}>
                            <Text style={styles.statusText}>Pending</Text>
                        </View>
                    </View>
                )}
                onEndReached={() => {
                    if (stops.length < total && !loading) {
                        fetchStops(search);
                    }
                }}
                onEndReachedThreshold={0.5}
                ListFooterComponent={loading ? <ActivityIndicator size="large" /> : null}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Theme.colors.background,
    },
    searchBar: {
        padding: Theme.spacing.md,
        backgroundColor: Theme.colors.card,
        borderBottomWidth: 1,
        borderBottomColor: Theme.colors.border,
    },
    searchInput: {
        backgroundColor: Theme.colors.background,
        padding: Theme.spacing.md,
        borderRadius: Theme.roundness,
        fontSize: 16,
    },
    stopCard: {
        backgroundColor: Theme.colors.card,
        padding: Theme.spacing.md,
        marginHorizontal: Theme.spacing.md,
        marginTop: Theme.spacing.sm,
        borderRadius: Theme.roundness,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        elevation: 1,
    },
    stopName: {
        fontSize: 16,
        fontWeight: 'bold',
        color: Theme.colors.text,
    },
    stopId: {
        fontSize: 12,
        color: Theme.colors.textLight,
    },
    statusBadge: {
        backgroundColor: '#FFF3CD',
        paddingHorizontal: Theme.spacing.sm,
        paddingVertical: 2,
        borderRadius: 4,
    },
    statusText: {
        color: '#856404',
        fontSize: 12,
        fontWeight: 'bold',
    },
});

export default StopListScreen;
