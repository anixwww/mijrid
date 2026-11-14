import React, { useState } from 'react';
import { Pet } from '../../types/tree';
import { uploadFileToServer } from '../../utils/fileStorage';
import { getResolvedMediaSrc, handleUploadImageError } from '../../utils/mediaSync';
import { Info, Upload, Trash2, Plus, X } from 'lucide-react';

interface PetsTabProps {
  pets: Pet[];
  onChangePets: (pets: Pet[]) => void;
  onError: (message: string) => void;
  onUploadingChange?: (isUploading: boolean) => void;
}

function getPetEmoji(type: Pet['type']): string {
  switch (type) {
    case 'cat':
      return '🐱';
    case 'bird':
      return '🦜';
    case 'horse':
      return '🐴';
    case 'cow':
      return '🐮';
    case 'other':
      return '🐾';
    default:
      return '🐶';
  }
}

function getPetLabel(type: Pet['type']): string {
  switch (type) {
    case 'cat':
      return 'Кіт';
    case 'dog':
      return 'Собака';
    case 'bird':
      return 'Птах';
    case 'horse':
      return 'Кінь';
    case 'cow':
      return 'Корова';
    default:
      return 'Улюбленець';
  }
}

export const PetsTab: React.FC<PetsTabProps> = ({
  pets,
  onChangePets,
  onError,
  onUploadingChange,
}) => {
  const [newPetName, setNewPetName] = useState('');
  const [newPetType, setNewPetType] = useState<Pet['type']>('dog');
  const [newPetBreed, setNewPetBreed] = useState('');
  const [newPetIsCouple, setNewPetIsCouple] = useState(false);
  const [newPetAvatarUrl, setNewPetAvatarUrl] = useState<string | undefined>(undefined);
  const [uploadingPetAvatarId, setUploadingPetAvatarId] = useState<string | null>(null);

  const handleNewPetAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingPetAvatarId('new');
      onUploadingChange?.(true);
      const url = await uploadFileToServer(file, { kind: 'pet' });
      setNewPetAvatarUrl(url);
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setUploadingPetAvatarId(null);
      onUploadingChange?.(false);
      e.target.value = '';
    }
  };

  const handleExistingPetAvatarUpload = async (
    petId: string,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingPetAvatarId(petId);
      onUploadingChange?.(true);
      const url = await uploadFileToServer(file, { kind: 'pet' });
      onChangePets(pets.map((p) => (p.id === petId ? { ...p, avatarUrl: url } : p)));
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setUploadingPetAvatarId(null);
      onUploadingChange?.(false);
      e.target.value = '';
    }
  };

  const handleAddPet = () => {
    if (!newPetName.trim()) {
      onError('Будь ласка, вкажіть кличку тварини.');
      return;
    }
    const petObj: Pet = {
      id: `pet-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: newPetName.trim(),
      type: newPetType,
      breed: newPetBreed.trim() || undefined,
      avatarUrl: newPetAvatarUrl,
      isCouplePet: newPetIsCouple,
    };
    onChangePets([...pets, petObj]);
    setNewPetName('');
    setNewPetBreed('');
    setNewPetAvatarUrl(undefined);
    setNewPetIsCouple(false);
  };

  return (
    <div className="space-y-5 animate-in fade-in-50 duration-150">
      <div className="flex items-start gap-2.5 text-xs text-stone-600 dark:text-zinc-400 pb-3 border-b border-stone-200 dark:border-zinc-800">
        <Info size={15} className="text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
        <span>
          Додавайте домашніх улюбленців та їхні фото. Тварину можна закріпити персонально за особою або позначити як спільну улюбленцю пари.
        </span>
      </div>

      {/* Existing Pets List */}
      <div className="space-y-2.5">
        {pets.length === 0 ? (
          <div className="text-center py-6 border border-dashed border-stone-200 dark:border-zinc-800 rounded-xl text-stone-400 dark:text-zinc-500 text-xs">
            Тварин поки що не додано
          </div>
        ) : (
          pets.map((pet) => (
            <div
              key={pet.id}
              className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 p-3 rounded-xl bg-white dark:bg-zinc-900/80 border border-stone-200 dark:border-zinc-800"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/60 text-amber-900 flex items-center justify-center font-bold text-xl shrink-0 overflow-hidden">
                  {pet.avatarUrl ? (
                    <img
                      src={getResolvedMediaSrc(pet.avatarUrl)}
                      alt={pet.name}
                      onError={(e) => handleUploadImageError(e, pet.avatarUrl)}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    getPetEmoji(pet.type)
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-stone-900 dark:text-zinc-100 truncate">
                      {pet.name}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        onChangePets(
                          pets.map((p) =>
                            p.id === pet.id ? { ...p, isCouplePet: !p.isCouplePet } : p
                          )
                        )
                      }
                      className={`text-[10px] px-2 py-0.5 rounded font-medium border transition-colors cursor-pointer ${
                        pet.isCouplePet
                          ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800/60'
                          : 'bg-stone-50 dark:bg-zinc-800 text-stone-500 dark:text-zinc-400 border-stone-200 dark:border-zinc-700 hover:text-stone-800'
                      }`}
                      title="Перемкнути: спільна тварина пари"
                    >
                      {pet.isCouplePet ? 'Спільна тварина Пари' : 'Особистий улюбленець'}
                    </button>
                  </div>
                  <span className="text-[11px] text-stone-500 dark:text-zinc-400 block truncate">
                    {pet.breed || getPetLabel(pet.type)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <label
                  className="px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-800 hover:bg-stone-100 dark:hover:bg-zinc-700 text-stone-700 dark:text-zinc-200 text-[11px] font-medium flex items-center gap-1 cursor-pointer transition-colors"
                  title={pet.avatarUrl ? 'Змінити фото тварини' : 'Завантажити фото тварини'}
                >
                  <Upload size={12} />
                  <span>
                    {uploadingPetAvatarId === pet.id
                      ? 'Завантаження...'
                      : pet.avatarUrl
                      ? 'Змінити фото'
                      : 'Фото'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingPetAvatarId === pet.id}
                    onChange={(e) => handleExistingPetAvatarUpload(pet.id, e)}
                  />
                </label>

                {pet.avatarUrl && (
                  <button
                    type="button"
                    onClick={() =>
                      onChangePets(
                        pets.map((p) => (p.id === pet.id ? { ...p, avatarUrl: undefined } : p))
                      )
                    }
                    className="p-1.5 rounded-lg text-stone-400 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors cursor-pointer"
                    title="Прибрати фото тварини"
                  >
                    <X size={14} />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onChangePets(pets.filter((p) => p.id !== pet.id))}
                  className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                  title="Видалити тварину"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add New Pet Form */}
      <section className="pt-4 border-t border-stone-200 dark:border-zinc-800 space-y-3.5">
        <h4 className="text-xs font-semibold tracking-wide text-stone-600 dark:text-zinc-300 flex items-center gap-1.5">
          <Plus size={14} className="text-emerald-700 dark:text-emerald-400" />
          <span>Додати нову тварину</span>
        </h4>

        {/* Pet Avatar Picker */}
        <div className="flex items-center gap-3 p-2.5 rounded-xl border border-stone-200 dark:border-zinc-800 bg-stone-50/70 dark:bg-zinc-900/50">
          <div className="w-14 h-14 rounded-xl bg-amber-100 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/60 flex items-center justify-center text-2xl shrink-0 overflow-hidden">
            {newPetAvatarUrl ? (
              <img
                src={getResolvedMediaSrc(newPetAvatarUrl)}
                alt="Аватар тварини"
                onError={(e) => handleUploadImageError(e, newPetAvatarUrl)}
                className="w-full h-full object-cover"
              />
            ) : (
              getPetEmoji(newPetType)
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-stone-800 dark:text-zinc-200">
              Аватар улюбленця
            </p>
            <p className="text-[11px] text-stone-500 dark:text-zinc-400">
              Завантажте фото або залиште стандартну іконку
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <label className="px-3 py-1.5 bg-white dark:bg-zinc-800 border border-stone-300 dark:border-zinc-700 hover:bg-stone-50 dark:hover:bg-zinc-700 text-stone-800 dark:text-zinc-200 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors">
              <Upload size={13} />
              <span>
                {uploadingPetAvatarId === 'new'
                  ? 'Завантаження...'
                  : newPetAvatarUrl
                  ? 'Змінити'
                  : 'Завантажити'}
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploadingPetAvatarId === 'new'}
                onChange={handleNewPetAvatarUpload}
              />
            </label>
            {newPetAvatarUrl && (
              <button
                type="button"
                onClick={() => setNewPetAvatarUrl(undefined)}
                className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                title="Видалити фото"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="min-w-0">
            <label className="block text-[11px] font-medium text-stone-600 dark:text-zinc-400 mb-1">
              Кличка / Назва
            </label>
            <input
              type="text"
              value={newPetName}
              onChange={(e) => setNewPetName(e.target.value)}
              placeholder="напр. Бровко, Рекс, Мура"
              className="w-full text-xs px-3 py-2 rounded-lg border border-stone-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-600/35 focus:border-emerald-600"
            />
          </div>
          <div className="min-w-0">
            <label className="block text-[11px] font-medium text-stone-600 dark:text-zinc-400 mb-1">
              Вид тварини
            </label>
            <select
              value={newPetType}
              onChange={(e) => setNewPetType(e.target.value as Pet['type'])}
              className="w-full text-xs px-3 py-2 rounded-lg border border-stone-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-600/35 focus:border-emerald-600"
            >
              <option value="dog">Собака 🐶</option>
              <option value="cat">Кіт / Кішка 🐱</option>
              <option value="bird">Птах 🦜</option>
              <option value="horse">Конячка 🐴</option>
              <option value="cow">Корова 🐮</option>
              <option value="other">Інша тварина 🐾</option>
            </select>
          </div>
          <div className="min-w-0">
            <label className="block text-[11px] font-medium text-stone-600 dark:text-zinc-400 mb-1">
              Порода (необов&apos;язково)
            </label>
            <input
              type="text"
              value={newPetBreed}
              onChange={(e) => setNewPetBreed(e.target.value)}
              placeholder="напр. Вівчарка, Перський"
              className="w-full text-xs px-3 py-2 rounded-lg border border-stone-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-600/35 focus:border-emerald-600"
            />
          </div>
          <div className="flex items-end pb-1.5">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-stone-800 dark:text-zinc-200">
              <input
                type="checkbox"
                checked={newPetIsCouple}
                onChange={(e) => setNewPetIsCouple(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-700 focus:ring-emerald-600 accent-emerald-700 cursor-pointer"
              />
              <span>Спільна тварина Пари</span>
            </label>
          </div>
        </div>

        <button
          type="button"
          onClick={handleAddPet}
          className="w-full py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Plus size={14} />
          <span>Додати улюбленця</span>
        </button>
      </section>
    </div>
  );
};
