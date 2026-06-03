import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { Producto } from './data/productos';

// TODO: Reemplaza esto con tu configuración real de Firebase
// 1. Ve a la consola de Firebase: https://console.firebase.google.com/
// 2. Crea un proyecto y añade una aplicación web
// 3. Copia el objeto firebaseConfig y pégalo aquí
const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "tu-proyecto.firebaseapp.com",
  projectId: "tu-proyecto",
  storageBucket: "tu-proyecto.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// Colección de productos
const productosRef = collection(db, 'productos');

export async function fetchProductosFirebase(): Promise<(Producto & { id: string })[]> {
  try {
    const snapshot = await getDocs(productosRef);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as (Producto & { id: string })[];
  } catch (error) {
    console.error("Error fetching products from Firebase (¿Configuraste tus credenciales?):", error);
    return []; // Fallback empty if not configured
  }
}

export async function saveProductoFirebase(producto: Omit<Producto, 'id'>) {
  try {
    const docRef = await addDoc(productosRef, producto);
    return docRef.id;
  } catch (error) {
    console.error("Error saving product:", error);
    throw error;
  }
}

export async function updateProductoFirebase(id: string, data: Partial<Producto>) {
  try {
    const productDoc = doc(db, 'productos', id);
    await updateDoc(productDoc, data);
  } catch (error) {
    console.error("Error updating product:", error);
    throw error;
  }
}

export async function deleteProductoFirebase(id: string) {
  try {
    const productDoc = doc(db, 'productos', id);
    await deleteDoc(productDoc);
  } catch (error) {
    console.error("Error deleting product:", error);
    throw error;
  }
}
