import { proto, BufferJSON, initAuthCreds, AuthenticationCreds, AuthenticationState, SignalDataTypeMap } from '@whiskeysockets/baileys';
import { db } from '../../database';
import { authCredentials } from '../../database/schema';
import { eq } from 'drizzle-orm';

export const usePostgresAuthState = async (collectionName: string): Promise<{ state: AuthenticationState, saveCreds: () => Promise<void> }> => {
    const writeData = async (data: any, id: string) => {
        const MAX_RETRIES = 3;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const key = `${collectionName}:${id}`;
                const value = JSON.stringify(data, BufferJSON.replacer);

                const existing = await db.select().from(authCredentials).where(eq(authCredentials.key, key));

                if (existing.length > 0) {
                    await db.update(authCredentials)
                        .set({ value })
                        .where(eq(authCredentials.key, key));
                } else {
                    await db.insert(authCredentials).values({ key, value });
                }
                return; // Success
            } catch (error: any) {
                console.warn(`⚠️ Error writing auth data (Attempt ${attempt}/${MAX_RETRIES}):`, error.message);
                if (attempt === MAX_RETRIES) {
                    console.error('❌ Failed to write auth data after retries:', error);
                } else {
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff-ish
                }
            }
        }
    };

    const readData = async (id: string) => {
        try {
            const key = `${collectionName}:${id}`;
            const result = await db.select().from(authCredentials).where(eq(authCredentials.key, key));

            if (result.length > 0) {
                return JSON.parse(result[0].value, BufferJSON.reviver);
            }
            return null;
        } catch (error) {
            console.error('Error reading auth data:', error);
            return null;
        }
    };

    const removeData = async (id: string) => {
        try {
            const key = `${collectionName}:${id}`;
            await db.delete(authCredentials).where(eq(authCredentials.key, key));
        } catch (error) {
            console.error('Error removing auth data:', error);
        }
    };

    const creds: AuthenticationCreds = (await readData('creds')) || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data: { [key: string]: SignalDataTypeMap[typeof type] } = {};
                    await Promise.all(
                        ids.map(async (id) => {
                            const value = await readData(`${type}:${id}`);
                            if (type === 'app-state-sync-key' && value) {
                                data[id] = proto.Message.AppStateSyncKeyData.fromObject(value) as any;
                            } else if (value) {
                                data[id] = value;
                            }
                        })
                    );
                    return data;
                },
                set: async (data) => {
                    const tasks: Promise<void>[] = [];
                    for (const category in data) {
                        const categoryKey = category as keyof SignalDataTypeMap;
                        const categoryData = data[categoryKey];

                        if (!categoryData) continue;

                        for (const id in categoryData) {
                            const value = categoryData[id];
                            if (value) {
                                tasks.push(writeData(value, `${category}:${id}`));
                            } else {
                                tasks.push(removeData(`${category}:${id}`));
                            }
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: () => writeData(creds, 'creds')
    };
};
