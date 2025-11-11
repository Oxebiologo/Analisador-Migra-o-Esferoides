# main.py

import os
from cell_counter import CellCounter
from skimage import filters
import numpy as np

def main():
    print("=== CONTADOR DE CÉLULAS ===")

    # Configurações
    imagem_path = input("Caminho da imagem .tif: ").strip()

    if not os.path.exists(imagem_path):
        print("Arquivo não encontrado!")
        return

    # Perguntar se tem modelo
    tem_modelo = input("Tem modelo treinado? (s/n): ").strip().lower()
    model_path = None

    if tem_modelo == 's':
        model_path = input("Caminho do modelo .h5: ").strip()
        if not os.path.exists(model_path):
            print("Modelo não encontrado! Usando processamento tradicional.")
            model_path = None

    # Analisar imagem
    counter = CellCounter(model_path)

    if counter.load_and_preprocess(imagem_path):
        if model_path:
            print("Fazendo predição com modelo...")
            counter.predict()
        else:
            print("Usando processamento tradicional...")
            # Processamento tradicional
            if len(counter.original_image.shape) == 2:
                thresh = filters.threshold_otsu(counter.original_image)
                counter.binary_mask = counter.original_image > thresh
            else:
                gray_image = np.mean(counter.original_image, axis=2)
                thresh = filters.threshold_otsu(gray_image)
                counter.binary_mask = gray_image > thresh

        # Ajustar parâmetros
        print("\nAjuste os parâmetros (ou pressione Enter para usar padrão):")
        try:
            threshold = input("Threshold (0.1-0.9) [0.5]: ").strip()
            threshold = float(threshold) if threshold else 0.5

            min_size = input("Tamanho mínimo (pixels) [30]: ").strip()
            min_size = int(min_size) if min_size else 30
        except:
            threshold = 0.5
            min_size = 30

        # Contar células
        cell_count = counter.count_and_analyze(threshold=threshold, min_size=min_size)

        # Mostrar resultados
        counter.visualize_results()
        counter.generate_report()

        # Salvar resultados
        salvar = input("\nSalvar resultados? (s/n): ").strip().lower()
        if salvar == 's':
            os.makedirs("resultados", exist_ok=True)
            nome_base = os.path.splitext(os.path.basename(imagem_path))[0]
            counter.visualize_results(save_path=f"resultados/{nome_base}_resultado.png")
            print(f"Resultado salvo em: resultados/{nome_base}_resultado.png")

    else:
        print("Erro ao processar a imagem!")

if __name__ == "__main__":
    main()
