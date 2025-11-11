import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers
import numpy as np
import matplotlib.pyplot as plt
import cv2
from skimage import io, exposure, morphology
from scipy import ndimage
import tifffile

print(f"TensorFlow version: {tf.__version__}")

# Carregar imagem .tif
def load_tif_image(image_path):
    """
    Carrega imagens .tif, incluindo stacks multicanais
    """
    try:
        image = tifffile.imread(image_path)
        print(f"Shape da imagem: {image.shape}")
        print(f"Tipo de dados: {image.dtype}")
        return image
    except Exception as e:
        print(f"Erro ao carregar imagem: {e}")
        return None

# Usar
# image = load_tif_image('amostra_celulas.tif')

def unet_model(input_size=(256, 256, 1)):
    """
    Implementação U-Net para segmentação de células
    """
    inputs = keras.Input(input_size)

    # Encoder (Downsampling)
    # Bloco 1
    conv1 = layers.Conv2D(64, 3, activation='relu', padding='same')(inputs)
    conv1 = layers.Conv2D(64, 3, activation='relu', padding='same')(conv1)
    pool1 = layers.MaxPooling2D(pool_size=(2, 2))(conv1)

    # Bloco 2
    conv2 = layers.Conv2D(128, 3, activation='relu', padding='same')(pool1)
    conv2 = layers.Conv2D(128, 3, activation='relu', padding='same')(conv2)
    pool2 = layers.MaxPooling2D(pool_size=(2, 2))(conv2)

    # Bloco 3
    conv3 = layers.Conv2D(256, 3, activation='relu', padding='same')(pool2)
    conv3 = layers.Conv2D(256, 3, activation='relu', padding='same')(conv3)
    pool3 = layers.MaxPooling2D(pool_size=(2, 2))(conv3)

    # Centro
    conv4 = layers.Conv2D(512, 3, activation='relu', padding='same')(pool3)
    conv4 = layers.Conv2D(512, 3, activation='relu', padding='same')(conv4)

    # Decoder (Upsampling)
    # Bloco 5
    up5 = layers.Conv2DTranspose(256, 2, strides=(2, 2), padding='same')(conv4)
    concat5 = layers.concatenate([up5, conv3])
    conv5 = layers.Conv2D(256, 3, activation='relu', padding='same')(concat5)
    conv5 = layers.Conv2D(256, 3, activation='relu', padding='same')(conv5)

    # Bloco 6
    up6 = layers.Conv2DTranspose(128, 2, strides=(2, 2), padding='same')(conv5)
    concat6 = layers.concatenate([up6, conv2])
    conv6 = layers.Conv2D(128, 3, activation='relu', padding='same')(concat6)
    conv6 = layers.Conv2D(128, 3, activation='relu', padding='same')(conv6)

    # Bloco 7
    up7 = layers.Conv2DTranspose(64, 2, strides=(2, 2), padding='same')(conv6)
    concat7 = layers.concatenate([up7, conv1])
    conv7 = layers.Conv2D(64, 3, activation='relu', padding='same')(concat7)
    conv7 = layers.Conv2D(64, 3, activation='relu', padding='same')(conv7)

    # Saída
    outputs = layers.Conv2D(1, 1, activation='sigmoid')(conv7)

    model = keras.Model(inputs, outputs)

    return model

# Modelo mais simples para detecção
def simple_cell_detector(input_size=(256, 256, 1)):
    """
    Modelo CNN mais simples para detecção de células
    """
    model = keras.Sequential([
        layers.Input(shape=input_size),

        # Bloco 1
        layers.Conv2D(32, 3, activation='relu', padding='same'),
        layers.BatchNormalization(),
        layers.MaxPooling2D(2),
        layers.Dropout(0.25),

        # Bloco 2
        layers.Conv2D(64, 3, activation='relu', padding='same'),
        layers.BatchNormalization(),
        layers.MaxPooling2D(2),
        layers.Dropout(0.25),

        # Bloco 3
        layers.Conv2D(128, 3, activation='relu', padding='same'),
        layers.BatchNormalization(),
        layers.MaxPooling2D(2),
        layers.Dropout(0.25),

        # Upsampling para manter resolução espacial
        layers.Conv2DTranspose(64, 3, strides=2, activation='relu', padding='same'),
        layers.Conv2DTranspose(32, 3, strides=2, activation='relu', padding='same'),
        layers.Conv2DTranspose(16, 3, strides=2, activation='relu', padding='same'),

        # Saída - mapa de probabilidade de células
        layers.Conv2D(1, 1, activation='sigmoid', padding='same')
    ])

    return model

def postprocess_prediction(prediction, min_size=50, threshold=0.5):
    """
    Pós-processamento das predições para identificar células individuais
    """
    # Binarizar a predição
    binary_mask = prediction > threshold

    # Operações morfológicas para limpar a máscara
    binary_mask = morphology.remove_small_objects(binary_mask, min_size=min_size)
    binary_mask = morphology.binary_closing(binary_mask, morphology.disk(2))
    binary_mask = morphology.binary_opening(binary_mask, morphology.disk(1))

    return binary_mask

def count_cells(binary_mask, min_distance=10):
    """
    Conta células individuais usando detecção de picos de distância
    """
    # Calcular distância euclidiana do fundo
    distance = ndimage.distance_transform_edt(binary_mask)

    # Encontrar máximos locais (centros das células)
    local_maxi = morphology.local_maxima(distance)

    # Marcar os máximos locais
    markers = ndimage.label(local_maxi)[0]

    # Watershed para separar células sobrepostas
    labels = morphology.watershed(-distance, markers, mask=binary_mask)

    # Contar células
    unique_labels = np.unique(labels)
    cell_count = len(unique_labels) - 1  # Excluir fundo (label 0)

    return cell_count, labels, local_maxi

def analyze_cell_properties(binary_mask, labels):
    """
    Analisa propriedades das células detectadas
    """
    properties = {
        'count': len(np.unique(labels)) - 1,
        'areas': [],
        'centroids': []
    }

    for label in np.unique(labels):
        if label == 0:  # Pular fundo
            continue

        # Máscara para a célula atual
        cell_mask = labels == label

        # Área
        area = np.sum(cell_mask)
        properties['areas'].append(area)

        # Centróide
        centroid = ndimage.center_of_mass(cell_mask)
        properties['centroids'].append(centroid)

    return properties

class CellCounter:
    def __init__(self, model_path=None):
        if model_path:
            self.model = keras.models.load_model(model_path)
        else:
            self.model = None

    def load_and_preprocess(self, image_path):
        """Carrega e pré-processa a imagem"""
        self.original_image = full_preprocessing_pipeline(image_path)
        if self.original_image is None:
            return False

        # Preparar para o modelo
        if len(self.original_image.shape) == 2:
            # Adicionar dimensões de canal e batch
            self.model_input = self.original_image[np.newaxis, :, :, np.newaxis]
        else:
            self.model_input = self.original_image[np.newaxis, :, :, :]

        return True

    def predict(self):
        """Faz a predição do modelo"""
        if self.model is None:
            print("Modelo não carregado!")
            return False

        self.raw_prediction = self.model.predict(self.model_input, verbose=0)
        self.prediction = self.raw_prediction[0, :, :, 0]  # Remover dimensões batch e channel
        return True

    def count_and_analyze(self, threshold=0.5, min_size=30):
        """Conta e analisa as células"""
        # Pós-processamento
        self.binary_mask = postprocess_prediction(self.prediction, min_size, threshold)

        # Contagem
        self.cell_count, self.labels, self.markers = count_cells(self.binary_mask)

        # Análise de propriedades
        self.properties = analyze_cell_properties(self.binary_mask, self.labels)

        return self.cell_count

    def visualize_results(self, save_path=None):
        """Visualiza os resultados"""
        fig, axes = plt.subplots(2, 3, figsize=(15, 10))

        # Imagem original
        axes[0, 0].imshow(self.original_image, cmap='gray')
        axes[0, 0].set_title('Imagem Original')
        axes[0, 0].axis('off')

        # Predição do modelo
        axes[0, 1].imshow(self.prediction, cmap='hot')
        axes[0, 1].set_title('Mapa de Predição')
        axes[0, 1].axis('off')

        # Máscara binária
        axes[0, 2].imshow(self.binary_mask, cmap='gray')
        axes[0, 2].set_title('Máscara Binária')
        axes[0, 2].axis('off')

        # Células detectadas
        axes[1, 0].imshow(self.original_image, cmap='gray')
        axes[1, 0].imshow(self.labels, cmap='jet', alpha=0.5)
        axes[1, 0].set_title(f'Células Detectadas: {self.cell_count}')
        axes[1, 0].axis('off')

        # Marcadores (centros)
        axes[1, 1].imshow(self.original_image, cmap='gray')
        axes[1, 1].imshow(self.markers, cmap='autumn', alpha=0.7)
        axes[1, 1].set_title('Centros das Células')
        axes[1, 1].axis('off')

        # Histograma de áreas
        axes[1, 2].hist(self.properties['areas'], bins=20, alpha=0.7, color='skyblue')
        axes[1, 2].set_title('Distribuição de Áreas')
        axes[1, 2].set_xlabel('Área (pixels)')
        axes[1, 2].set_ylabel('Frequência')

        plt.tight_layout()

        if save_path:
            plt.savefig(save_path, dpi=300, bbox_inches='tight')

        plt.show()

    def generate_report(self):
        """Gera relatório detalhado"""
        print("=" * 50)
        print("RELATÓRIO DE ANÁLISE DE CÉLULAS")
        print("=" * 50)
        print(f"Total de células detectadas: {self.cell_count}")
        print(f"Área média: {np.mean(self.properties['areas']):.2f} pixels")
        print(f"Desvio padrão da área: {np.std(self.properties['areas']):.2f} pixels")
        print(f"Área mínima: {np.min(self.properties['areas'])} pixels")
        print(f"Área máxima: {np.max(self.properties['areas'])} pixels")
        print("=" * 50)

# Exemplo de uso completo
def analyze_cell_image(image_path, model_path=None, threshold=0.5):
    """
    Função principal para análise de imagem de células
    """
    # Inicializar contador
    counter = CellCounter(model_path)

    # Carregar imagem
    if not counter.load_and_preprocess(image_path):
        print("Erro ao carregar imagem!")
        return None

    # Fazer predição (se modelo disponível)
    if model_path:
        counter.predict()
    else:
        # Usar método tradicional se não há modelo
        print("Usando detecção tradicional (sem modelo treinado)")
        # Implementar detecção tradicional aqui se necessário

    # Contar células
    cell_count = counter.count_and_analyze(threshold=threshold)

    # Visualizar resultados
    counter.visualize_results()

    # Gerar relatório
    counter.generate_report()

    return counter

def evaluate_counting_accuracy(true_counts, predicted_counts):
    """
    Avalia a precisão da contagem
    """
    true_counts = np.array(true_counts)
    predicted_counts = np.array(predicted_counts)

    metrics = {
        'mae': np.mean(np.abs(true_counts - predicted_counts)),
        'mse': np.mean((true_counts - predicted_counts) ** 2),
        'rmse': np.sqrt(np.mean((true_counts - predicted_counts) ** 2)),
        'r_squared': 1 - np.sum((true_counts - predicted_counts) ** 2) / np.sum((true_counts - np.mean(true_counts)) ** 2)
    }

    print("Métricas de Avaliação:")
    for metric, value in metrics.items():
        print(f"{metric.upper()}: {value:.4f}")

    return metrics
