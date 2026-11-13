import React, { useState, useMemo } from 'react';
import { Person, RelativeType, Gender, ConnectionMeta } from '../types/tree';
import { uploadFileToServer } from '../utils/fileStorage';
import { formatSingleDate, UKRAINIAN_MONTHS, padZero } from '../utils/dateUtils';
import { checkGenderMismatch } from '../utils/genderValidation';
import { SilhouetteAvatar } from './SilhouetteAvatar';
import {
  X,
  Upload,
  User,
  Heart,
  HeartCrack,
  Users,
  CheckCircle,
  AlertCircle,
  Calendar,
  ChevronDown,
  ChevronUp,
  MapPin,
  Sparkles,
} from 'lucide-react';

interface AddRelativeModalProps {
  targetPerson?: Person | null;
  initialType?: RelativeType;
  isOpen: boolean;
  onClose: () => void;
  onAdd: (data: {
    relationType?: RelativeType;
    eventType?: 'marriage' | 'cohabitation' | 'divorce';
    eventDate?: string;
    markPreviousSpouseDivorced?: boolean;
    previousSpouseIdToDivorce?: string;
    linkAllExistingChildren?: boolean;
    firstName: string;
    lastName: string;
    maidenName?: string;
    nickname?: string;
    gender: Gender;
    yearsDisplay?: string;
    birthDate?: string;
    birthDay?: string;
    birthMonth?: string;
    birthYear?: string;
    birthYearEnd?: string;
    isBirthDateApproximate?: boolean;
    birthDateType?: 'exact' | 'period' | 'about';
    deathDate?: string;
    deathDay?: string;
    deathMonth?: string;
    deathYear?: string;
    isDeceased?: boolean;
    houseNumber?: string;
    birthPlace?: string;
    residencePlace?: string;
    deathPlace?: string;
    burialPlace?: string;
    profession?: string;
    deathCause?: string;
    godparents?: string;
    cardBgColor?: string;
    isVerified?: boolean;
    isFullyVerified?: boolean;
    avatarUrl?: string;
    flagEmoji?: string;
    notes?: string;
  }) => void;
  allPersons?: Record<string, Person>;
  connectionOverrides?: Record<string, ConnectionMeta>;
}

export const AddRelativeModal: React.FC<AddRelativeModalProps> = ({
  targetPerson,
  initialType = 'child',
  isOpen,
  onClose,
  onAdd,
  allPersons,
  connectionOverrides,
}) => {
  const isFirstPerson = !targetPerson;

  const normalizedInitialType = (): RelativeType => {
    if (initialType === 'parent') return 'father';
    return initialType;
  };

  const existingSpousePersons = useMemo(() => {
    if (!targetPerson?.spouses || !allPersons) return [];
    return targetPerson.spouses.map((id) => allPersons[id]).filter(Boolean);
  }, [targetPerson, allPersons]);

  const activeSpousePersons = useMemo(() => {
    return existingSpousePersons.filter((sp) => {
      const mKey = targetPerson ? [targetPerson.id, sp.id].sort().join('::') : '';
      return connectionOverrides?.[`marriage:${mKey}`]?.eventType !== 'divorce';
    });
  }, [existingSpousePersons, targetPerson, connectionOverrides]);

  const existingChildren = useMemo(() => {
    if (!targetPerson?.children || !allPersons) return [];
    return targetPerson.children.map((id) => allPersons[id]).filter(Boolean);
  }, [targetPerson, allPersons]);

  const [relationType, setRelationType] = useState<RelativeType>(normalizedInitialType);
  const [unionType, setUnionType] = useState<'marriage' | 'cohabitation' | 'divorce'>('marriage');
  const [eventDate, setEventDate] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState(
    targetPerson ? (initialType === 'spouse' ? '' : targetPerson.lastName || '') : ''
  );
  const [maidenName, setMaidenName] = useState('');
  const [nickname, setNickname] = useState('');
  const [houseNumber, setHouseNumber] = useState('');
  const [birthPlace, setBirthPlace] = useState('');
  const [residencePlace, setResidencePlace] = useState('');
  const [deathPlace, setDeathPlace] = useState('');
  const [burialPlace, setBurialPlace] = useState('');
  const [profession, setProfession] = useState('');
  const [deathCause, setDeathCause] = useState('');
  const [godparents, setGodparents] = useState('');
  const [cardBgColor, setCardBgColor] = useState('#e8efe9');
  const [isVerified, setIsVerified] = useState(true);
  const [isFullyVerified, setIsFullyVerified] = useState(false);
  const [showExtraDetails, setShowExtraDetails] = useState(false);

  const [markPreviousSpouseDivorced, setMarkPreviousSpouseDivorced] = useState(true);
  const [selectedPrevSpouseId, setSelectedPrevSpouseId] = useState<string>(
    () => activeSpousePersons[0]?.id || existingSpousePersons[0]?.id || ''
  );
  const [linkAllExistingChildren, setLinkAllExistingChildren] = useState<boolean>(
    () => existingSpousePersons.length === 0
  );

  const [gender, setGender] = useState<Gender>(() => {
    if (initialType === 'father' || initialType === 'brother' || initialType === 'son') return 'male';
    if (initialType === 'mother' || initialType === 'sister' || initialType === 'daughter') return 'female';
    if (initialType === 'spouse') return targetPerson?.gender === 'male' ? 'female' : 'male';
    return 'male';
  });

  const [birthDateType, setBirthDateType] = useState<'exact' | 'period' | 'about'>('exact');
  const [birthDay, setBirthDay] = useState('');
  const [birthMonth, setBirthMonth] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [birthYearEnd, setBirthYearEnd] = useState('');
  const [isBirthDateApproximate, setIsBirthDateApproximate] = useState(false);

  const [isDeceased, setIsDeceased] = useState(false);
  const [deathDay, setDeathDay] = useState('');
  const [deathMonth, setDeathMonth] = useState('');
  const [deathYear, setDeathYear] = useState('');

  const [notes, setNotes] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleRelationChange = (newType: RelativeType) => {
    setErrorMessage(null);
    setRelationType(newType);
    if (newType === 'father' || newType === 'brother' || newType === 'son') {
      setGender('male');
    } else if (newType === 'mother' || newType === 'sister' || newType === 'daughter') {
      setGender('female');
    } else if (newType === 'spouse') {
      setGender(targetPerson?.gender === 'male' ? 'female' : 'male');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        setErrorMessage(null);
        const url = await uploadFileToServer(file);
        setAvatarUrl(url);
      } catch (err) {
        setErrorMessage((err as Error).message);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() && !lastName.trim()) {
      setErrorMessage("Будь ласка, введіть ім'я або прізвище особи.");
      return;
    }

    const isPeriod = birthDateType === 'period' || Boolean(birthYearEnd.trim());
    const isApprox = birthDateType === 'about' || isBirthDateApproximate;
    const formattedBirth = formatSingleDate(
      birthDay,
      birthMonth,
      birthYear,
      '.',
      isPeriod ? birthYearEnd.trim() : undefined,
      isApprox
    );
    const formattedDeath = isDeceased ? formatSingleDate(deathDay, deathMonth, deathYear, '.') : '';

    let generatedYearsDisplay = '';
    if (formattedBirth && formattedDeath) {
      generatedYearsDisplay = `${formattedBirth} — ${formattedDeath}`;
    } else if (formattedBirth) {
      generatedYearsDisplay = isDeceased ? `${formattedBirth} —` : formattedBirth;
    } else if (formattedDeath) {
      generatedYearsDisplay = formattedDeath;
    }

    onAdd({
      relationType: isFirstPerson ? undefined : relationType,
      eventType: relationType === 'spouse' ? unionType : undefined,
      eventDate: relationType === 'spouse' && eventDate.trim() ? eventDate.trim() : undefined,
      markPreviousSpouseDivorced:
        relationType === 'spouse' && activeSpousePersons.length > 0 && unionType !== 'divorce'
          ? markPreviousSpouseDivorced
          : false,
      previousSpouseIdToDivorce: selectedPrevSpouseId || activeSpousePersons[0]?.id,
      linkAllExistingChildren: relationType === 'spouse' ? linkAllExistingChildren : undefined,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      maidenName: maidenName.trim() || undefined,
      nickname: nickname.trim() || undefined,
      gender,
      yearsDisplay: generatedYearsDisplay || undefined,
      birthDate: formattedBirth || (birthYear.trim() ? (isPeriod && birthYearEnd.trim() ? `${birthYear.trim()}–${birthYearEnd.trim()}` : birthYear.trim()) : undefined),
      birthDay: birthDay ? padZero(birthDay) : undefined,
      birthMonth: birthMonth ? padZero(birthMonth) : undefined,
      birthYear: birthYear.trim() || undefined,
      birthYearEnd: isPeriod && birthYearEnd.trim() ? birthYearEnd.trim() : undefined,
      isBirthDateApproximate: isApprox || isPeriod,
      birthDateType,
      deathDate: formattedDeath || undefined,
      deathDay: isDeceased && deathDay ? padZero(deathDay) : undefined,
      deathMonth: isDeceased && deathMonth ? padZero(deathMonth) : undefined,
      deathYear: isDeceased && deathYear.trim() ? deathYear.trim() : undefined,
      isDeceased,
      houseNumber: houseNumber.trim() || undefined,
      birthPlace: birthPlace.trim() || undefined,
      residencePlace: residencePlace.trim() || undefined,
      deathPlace: isDeceased ? deathPlace.trim() || undefined : undefined,
      burialPlace: isDeceased ? burialPlace.trim() || undefined : undefined,
      profession: profession.trim() || undefined,
      deathCause: isDeceased ? deathCause.trim() || undefined : undefined,
      godparents: godparents.trim() || undefined,
      cardBgColor,
      isVerified,
      isFullyVerified,
      avatarUrl,
      notes: notes.trim() || undefined,
    });
    onClose();
  };

  const targetFullName = targetPerson
    ? [targetPerson.firstName, targetPerson.lastName].filter(Boolean).join(' ')
    : '';

  const spousePerson = targetPerson?.spouses?.[0] && allPersons ? allPersons[targetPerson.spouses[0]] : null;
  const spouseFullName = spousePerson
    ? [spousePerson.firstName, spousePerson.lastName].filter(Boolean).join(' ')
    : '';

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-stone-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-[#f4f7f4] to-[#edf3ee] border-b border-[#d8e2d9] flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-stone-900 leading-tight">
              {isFirstPerson ? 'Додати першу особу до дерева' : 'Додати родича'}
            </h3>
            <p className="text-[11px] text-stone-600 mt-0.5">
              {isFirstPerson ? (
                'Початок нового класичного родоводу'
              ) : relationType === 'spouse' ? (
                <>
                  {targetPerson?.gender === 'female'
                    ? ((targetPerson?.spouses?.length || 0) > 0 ? 'Додати ще одного чоловіка для:' : 'Додати чоловіка для:')
                    : targetPerson?.gender === 'male'
                    ? ((targetPerson?.spouses?.length || 0) > 0 ? 'Додати ще одну дружину для:' : 'Додати дружину для:')
                    : 'Подружжя для:'}{' '}
                  <span className="font-semibold text-emerald-900">{targetFullName}</span>
                </>
              ) : relationType === 'child' && spouseFullName ? (
                <>
                  Для батьків:{' '}
                  <span className="font-semibold text-emerald-900">
                    {targetFullName} та {spouseFullName}
                  </span>
                </>
              ) : (
                <>
                  Для: <span className="font-semibold text-emerald-900">{targetFullName}</span>
                </>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 transition-colors"
            title="Закрити"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center justify-between animate-in fade-in">
              <span>{errorMessage}</span>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="text-rose-400 hover:text-rose-700 p-0.5 cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {(() => {
            const genderWarning = checkGenderMismatch(firstName, gender);
            if (!genderWarning) return null;
            return (
              <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs flex items-center gap-2.5 animate-in fade-in">
                <AlertCircle size={16} className="text-amber-600 shrink-0" />
                <span className="font-medium">{genderWarning}</span>
              </div>
            );
          })()}

          {/* Relation Selector */}
          {!isFirstPerson && (
            <div>
              <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-2">
                Тип родинного зв'язку
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                {[
                  { type: 'father', label: 'Батько', icon: User, color: 'text-emerald-700' },
                  { type: 'mother', label: 'Мати', icon: User, color: 'text-emerald-700' },
                  {
                    type: 'spouse',
                    label: targetPerson?.gender === 'female'
                      ? 'Чоловік'
                      : targetPerson?.gender === 'male'
                      ? 'Дружина'
                      : 'Подружжя',
                    icon: Heart,
                    color: 'text-rose-600',
                  },
                  { type: 'child', label: 'Дитина', icon: Users, color: 'text-amber-700' },
                  { type: 'sibling', label: 'Брат / Сестра', icon: Users, color: 'text-sky-700' },
                ].map((item) => {
                  const isSelected = relationType === item.type;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() => handleRelationChange(item.type as RelativeType)}
                      className={`py-2 px-2 rounded-xl border text-xs font-medium flex flex-col items-center gap-1 transition-all ${
                        isSelected
                          ? 'border-emerald-700 bg-emerald-50 text-emerald-950 ring-1 ring-emerald-600 shadow-2xs font-semibold'
                          : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
                      }`}
                    >
                      <Icon size={16} className={isSelected ? 'text-emerald-800' : item.color} />
                      <span className="text-[11px] leading-tight text-center">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Union Type Selector when relation is Spouse */}
          {!isFirstPerson && relationType === 'spouse' && (
            <div className="p-3.5 bg-gradient-to-br from-emerald-50/90 to-stone-50 rounded-xl border border-emerald-200/90 space-y-3 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-emerald-950 uppercase tracking-wider">
                  Статус союзу / подружжя
                </label>
                <span className="text-[10px] text-emerald-800 font-medium">
                  {targetPerson?.gender === 'female' ? 'для жінки' : 'для чоловіка'}
                </span>
              </div>

              {/* 3 Union Type Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setUnionType('marriage')}
                  className={`py-2 px-2.5 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    unionType === 'marriage'
                      ? 'border-emerald-700 bg-white text-emerald-950 ring-2 ring-emerald-600/30 font-bold shadow-xs'
                      : 'border-stone-200 bg-white/70 text-stone-700 hover:bg-white'
                  }`}
                >
                  <span className="text-base">💍</span>
                  <span>Офіційний шлюб</span>
                </button>

                <button
                  type="button"
                  onClick={() => setUnionType('divorce')}
                  className={`py-2 px-2.5 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    unionType === 'divorce'
                      ? 'border-rose-600 bg-rose-50 text-rose-950 ring-2 ring-rose-500/30 font-bold shadow-xs'
                      : 'border-stone-200 bg-white/70 text-stone-700 hover:bg-white hover:text-rose-900'
                  }`}
                >
                  <span className="text-base">💔</span>
                  <span>Розлучення / Колишні</span>
                </button>

                <button
                  type="button"
                  onClick={() => setUnionType('cohabitation')}
                  className={`py-2 px-2.5 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    unionType === 'cohabitation'
                      ? 'border-emerald-700 bg-white text-emerald-950 ring-2 ring-emerald-600/30 font-bold shadow-xs'
                      : 'border-stone-200 bg-white/70 text-stone-700 hover:bg-white'
                  }`}
                >
                  <span className="text-base">💚</span>
                  <span>Без шлюбу / Союз</span>
                </button>
              </div>

              {/* Date of Union or Divorce */}
              <div>
                <label className="block text-[11px] font-semibold text-stone-700 mb-1 flex items-center gap-1">
                  <Calendar size={12} className="text-stone-500" />
                  <span>
                    {unionType === 'marriage'
                      ? 'Рік або дата шлюбу'
                      : unionType === 'divorce'
                      ? 'Рік або дата розлучення'
                      : 'Рік або дата початку союзу'}
                  </span>
                  <span className="text-[10px] text-stone-400 font-normal">(необов'язково)</span>
                </label>
                <input
                  type="text"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  placeholder={
                    unionType === 'marriage'
                      ? 'напр. 1985 або 14.10.1985'
                      : unionType === 'divorce'
                      ? 'напр. 1999 або 22.03.1999'
                      : 'напр. 2010'
                  }
                  className="w-full text-xs px-3 py-1.5 rounded-lg border border-stone-300 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-600 font-mono"
                />
              </div>

              {/* Previous Spouse Divorce Checkbox */}
              {activeSpousePersons.length > 0 && unionType !== 'divorce' && (
                <div className="p-2.5 bg-amber-50/90 rounded-lg border border-amber-200 text-xs space-y-1.5">
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      id="divorcePrevSpouse"
                      checked={markPreviousSpouseDivorced}
                      onChange={(e) => setMarkPreviousSpouseDivorced(e.target.checked)}
                      className="mt-0.5 rounded text-rose-600 focus:ring-rose-500 cursor-pointer"
                    />
                    <label htmlFor="divorcePrevSpouse" className="cursor-pointer text-amber-950 font-medium leading-tight">
                      <span>Позначити попередній шлюб як розірваний (розлучення 💔)</span>
                      <p className="text-[10.5px] text-amber-800 font-normal mt-0.5">
                        Попереднє подружжя ({activeSpousePersons.map((s) => `${s.firstName} ${s.lastName}`.trim()).join(', ')})
                        буде відокремлене лінією розлучення, а нова картка утворить актуальну пару.
                      </p>
                    </label>
                  </div>
                </div>
              )}

              {/* Link Existing Children Checkbox */}
              {existingChildren.length > 0 && (
                <div className="p-2.5 bg-stone-100/90 rounded-lg border border-stone-200 text-xs">
                  <label className="flex items-start gap-2 cursor-pointer text-stone-800 font-medium leading-tight">
                    <input
                      type="checkbox"
                      checked={linkAllExistingChildren}
                      onChange={(e) => setLinkAllExistingChildren(e.target.checked)}
                      className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                    <div>
                      <span>Пов'язати існуючих дітей ({existingChildren.length}) як спільних з цим подружжям</span>
                      <p className="text-[10px] text-stone-500 font-normal mt-0.5">
                        Діти ({existingChildren.slice(0, 3).map((c) => c.firstName).join(', ')}
                        {existingChildren.length > 3 ? '...' : ''}) отримають цього партнера як другого батька/матір.
                      </p>
                    </div>
                  </label>
                </div>
              )}
            </div>
          )}

          {/* Connection Verification Status */}
          {!isFirstPerson && (
            <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-200 flex items-center justify-between gap-2">
              <div className="text-xs font-medium text-stone-700">
                <span>Статус зв'язку:</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsVerified(true)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border flex items-center gap-1.5 transition-all ${
                    isVerified
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-600 font-semibold'
                      : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
                  }`}
                >
                  <CheckCircle size={12} className="text-emerald-700" />
                  <span>🟢 Достовірний</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsVerified(false)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border flex items-center gap-1.5 transition-all ${
                    !isVerified
                      ? 'border-stone-500 bg-stone-100 text-stone-900 ring-1 ring-stone-400 font-semibold'
                      : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
                  }`}
                >
                  <AlertCircle size={12} className="text-stone-500" />
                  <span>⚪ Неперевірений</span>
                </button>
              </div>
            </div>
          )}

          {/* Gender & Photo Row */}
          <div className="flex items-center gap-4 p-3 bg-stone-50/80 rounded-xl border border-stone-200">
            <div className="relative group shrink-0">
              <SilhouetteAvatar
                gender={gender}
                avatarUrl={avatarUrl}
                name={`${firstName} ${lastName}`}
                size="md"
              />
              <label className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white cursor-pointer transition-opacity">
                <Upload size={14} />
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-stone-800">Стать та світлина</span>
                {avatarUrl && (
                  <button
                    type="button"
                    onClick={() => setAvatarUrl(undefined)}
                    className="text-[11px] text-rose-600 hover:underline font-medium"
                  >
                    Видалити
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center bg-white border border-stone-300 rounded-lg p-0.5">
                  <button
                    type="button"
                    onClick={() => setGender('male')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      gender === 'male'
                        ? 'bg-sky-800 text-white shadow-2xs'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    Чоловіча
                  </button>
                  <button
                    type="button"
                    onClick={() => setGender('female')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      gender === 'female'
                        ? 'bg-rose-800 text-white shadow-2xs'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    Жіноча
                  </button>
                </div>

                <label className="cursor-pointer inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-stone-300 bg-white hover:bg-stone-50 text-[11px] text-stone-700 font-medium transition-colors shadow-2xs">
                  <Upload size={12} className="text-emerald-800" />
                  <span>{avatarUrl ? 'Змінити' : 'Завантажити фото'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Names */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Ім'я <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="напр. Іван або Марія"
                className="w-full text-sm px-3 py-2 rounded-lg border border-stone-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/40 focus:border-emerald-600"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-stone-700">
                  Прізвище
                </label>
                {relationType === 'spouse' && targetPerson?.gender === 'male' && targetPerson.lastName && lastName !== targetPerson.lastName && (
                  <button
                    type="button"
                    onClick={() => setLastName(targetPerson.lastName)}
                    className="text-[10px] text-emerald-800 hover:text-emerald-950 font-medium hover:underline flex items-center gap-0.5"
                  >
                    <span>Взяти прізвище чоловіка</span>
                  </button>
                )}
              </div>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="напр. Коваленко"
                className="w-full text-sm px-3 py-2 rounded-lg border border-stone-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/40 focus:border-emerald-600"
              />
            </div>
          </div>

          {/* Maiden Name, Nickname & House Number */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {gender === 'female' && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-stone-700">
                    Дівоче / дошлюбне прізвище
                  </label>
                  <span className="text-[10px] text-stone-400 font-normal">відображається: (Дівоче)</span>
                </div>
                <input
                  type="text"
                  value={maidenName}
                  onChange={(e) => setMaidenName(e.target.value)}
                  placeholder="напр. Ковальчук або Бондар"
                  className="w-full text-sm px-3 py-2 rounded-lg border border-stone-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/40 focus:border-emerald-600"
                />
              </div>
            )}

            <div className={gender === 'female' ? '' : 'sm:col-span-2'}>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Прізвисько («придомок» родини)
              </label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="напр. Чут або Кулинич"
                className="w-full text-sm px-3 py-2 rounded-lg border border-stone-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/40 focus:border-emerald-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-emerald-950 mb-1 flex items-center gap-1.5">
                <svg
                  viewBox="0 0 24 24"
                  className="w-4 h-4 text-emerald-800 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 10.5L12 3l9 7.5V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="#f0fdf4" />
                </svg>
                <span>Номер дому народження (№)</span>
              </label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={houseNumber}
                  onChange={(e) => setHouseNumber(e.target.value)}
                  placeholder="напр. 47 або 10"
                  className="w-full text-sm px-3 py-2 pr-11 rounded-lg border border-stone-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/40 focus:border-emerald-600 font-mono"
                />
                {houseNumber && (
                  <div
                    className="absolute right-2 h-6 px-2 min-w-[24px] flex items-center justify-center bg-white rounded-full shadow-xs border border-emerald-400 pointer-events-none"
                    title="Піктограма на картці"
                  >
                    <span className="text-[10px] font-mono font-bold leading-none text-emerald-900">
                      №{houseNumber}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>



          {/* Date of Birth */}
          <div className="p-3.5 bg-[#f8faf8] rounded-xl border border-stone-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-stone-800 flex items-center gap-1.5">
                <Calendar size={13} className="text-emerald-700" />
                <span>Дата народження</span>
              </label>
              <span className="text-[11px] text-emerald-800 font-mono font-medium">
                {formatSingleDate(
                  birthDay,
                  birthMonth,
                  birthYear,
                  '.',
                  birthDateType === 'period' ? birthYearEnd : undefined,
                  birthDateType === 'about'
                ) || 'Не вказано'}
              </span>
            </div>

            {/* Mode Selector: Точна дата / Період (діапазон) / Приблизно */}
            <div className="flex items-center gap-1 bg-stone-200/60 p-0.5 rounded-lg text-[11px]">
              <button
                type="button"
                onClick={() => {
                  setBirthDateType('exact');
                  setIsBirthDateApproximate(false);
                }}
                className={`flex-1 py-1 px-2 rounded-md font-medium transition-all cursor-pointer ${
                  birthDateType === 'exact'
                    ? 'bg-white text-emerald-950 font-bold shadow-2xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                Точна дата
              </button>
              <button
                type="button"
                onClick={() => {
                  setBirthDateType('period');
                  setIsBirthDateApproximate(true);
                }}
                className={`flex-1 py-1 px-2 rounded-md font-medium transition-all cursor-pointer ${
                  birthDateType === 'period'
                    ? 'bg-white text-emerald-950 font-bold shadow-2xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                Період (діапазон років)
              </button>
              <button
                type="button"
                onClick={() => {
                  setBirthDateType('about');
                  setIsBirthDateApproximate(true);
                }}
                className={`flex-1 py-1 px-2 rounded-md font-medium transition-all cursor-pointer ${
                  birthDateType === 'about'
                    ? 'bg-white text-emerald-950 font-bold shadow-2xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                Близько (бл.)
              </button>
            </div>

            {birthDateType !== 'period' ? (
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] text-stone-600 mb-0.5">Число (день)</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={birthDay}
                    onChange={(e) => setBirthDay(e.target.value)}
                    placeholder="1-31"
                    className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-stone-300 focus:outline-none focus:ring-1 focus:ring-emerald-600 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-stone-600 mb-0.5">Місяць</label>
                  <select
                    value={birthMonth}
                    onChange={(e) => setBirthMonth(e.target.value)}
                    className="w-full text-xs px-2 py-1.5 rounded-lg border border-stone-300 focus:outline-none focus:ring-1 focus:ring-emerald-600 bg-white"
                  >
                    <option value="">Не обрано</option>
                    {UKRAINIAN_MONTHS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-stone-600 mb-0.5">
                    {birthDateType === 'about' ? 'Рік (бл.)' : 'Рік'}
                  </label>
                  <input
                    type="text"
                    value={birthYear}
                    onChange={(e) => setBirthYear(e.target.value)}
                    placeholder="напр. 1925"
                    className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-stone-300 focus:outline-none focus:ring-1 focus:ring-emerald-600 bg-white font-mono"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2 animate-in fade-in duration-150">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-stone-600 mb-0.5">Рік від (початок періоду)</label>
                    <input
                      type="text"
                      value={birthYear}
                      onChange={(e) => setBirthYear(e.target.value)}
                      placeholder="напр. 1910"
                      className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-stone-300 focus:outline-none focus:ring-1 focus:ring-emerald-600 bg-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-stone-600 mb-0.5">Рік до (кінець періоду)</label>
                    <input
                      type="text"
                      value={birthYearEnd}
                      onChange={(e) => setBirthYearEnd(e.target.value)}
                      placeholder="напр. 1912"
                      className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-stone-300 focus:outline-none focus:ring-1 focus:ring-emerald-600 bg-white font-mono"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-stone-500 italic">
                  💡 Вказуйте період, коли точний рік народження в метриках чи переписах зазначено орієнтовно (наприклад: 1910–1912).
                </p>
              </div>
            )}
          </div>

          {/* Date of Death */}
          <div className="p-3 bg-[#faf9f8] rounded-xl border border-stone-200 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-stone-800 flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isDeceased}
                  onChange={(e) => setIsDeceased(e.target.checked)}
                  className="rounded text-stone-800 focus:ring-stone-600 accent-stone-800 w-4 h-4 cursor-pointer"
                />
                <span>Особа померла (вказати дату смерті)</span>
              </label>
              {isDeceased && (
                <span className="text-[10px] text-stone-600 font-mono font-medium">
                  {formatSingleDate(deathDay, deathMonth, deathYear, '.') || 'Дата не вказана'}
                </span>
              )}
            </div>

            {isDeceased && (
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-stone-200 animate-in fade-in-50 duration-150">
                <div>
                  <label className="block text-[11px] text-stone-600 mb-0.5">Число</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={deathDay}
                    onChange={(e) => setDeathDay(e.target.value)}
                    placeholder="1-31"
                    className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-stone-300 focus:outline-none focus:ring-1 focus:ring-emerald-600 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-stone-600 mb-0.5">Місяць</label>
                  <select
                    value={deathMonth}
                    onChange={(e) => setDeathMonth(e.target.value)}
                    className="w-full text-xs px-2 py-1.5 rounded-lg border border-stone-300 focus:outline-none focus:ring-1 focus:ring-emerald-600 bg-white"
                  >
                    <option value="">Не обрано</option>
                    {UKRAINIAN_MONTHS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-stone-600 mb-0.5">Рік</label>
                  <input
                    type="number"
                    value={deathYear}
                    onChange={(e) => setDeathYear(e.target.value)}
                    placeholder="напр. 1994"
                    className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-stone-300 focus:outline-none focus:ring-1 focus:ring-emerald-600 bg-white font-mono"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Card Background Color Selector */}
          <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-stone-800">
                Колір фону картки
              </span>
              <span className="text-[10px] font-mono text-stone-500 uppercase">{cardBgColor}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {[
                { name: 'Чебрецевий', hex: '#e8efe9' },
                { name: 'Вінтажний', hex: '#fbf7ee' },
                { name: 'Блакитний', hex: '#e0f2fe' },
                { name: 'Рожевий', hex: '#ffe4e6' },
                { name: 'Бурштиновий', hex: '#fef3c7' },
                { name: 'Бузковий', hex: '#f3e8ff' },
                { name: 'Білий', hex: '#ffffff' },
              ].map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => setCardBgColor(c.hex)}
                  style={{ backgroundColor: c.hex }}
                  className={`w-7 h-7 rounded-full border shadow-2xs transition-transform hover:scale-110 flex items-center justify-center ${
                    cardBgColor.toLowerCase() === c.hex.toLowerCase()
                      ? 'ring-2 ring-emerald-700 ring-offset-1 border-emerald-800'
                      : 'border-stone-300'
                  }`}
                  title={c.name}
                >
                  {cardBgColor.toLowerCase() === c.hex.toLowerCase() && (
                    <span className="w-2 h-2 rounded-full bg-emerald-800"></span>
                  )}
                </button>
              ))}

              <label className="flex items-center gap-1.5 ml-2 cursor-pointer text-xs text-stone-600">
                <span>Власний:</span>
                <input
                  type="color"
                  value={cardBgColor}
                  onChange={(e) => setCardBgColor(e.target.value)}
                  className="w-7 h-7 rounded border border-stone-300 cursor-pointer p-0.5 bg-white"
                />
              </label>
            </div>
          </div>

          {/* Collapsible Additional Details (Places, Profession, Godparents, Notes) */}
          <div className="border border-stone-200 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowExtraDetails((prev) => !prev)}
              className="w-full px-3.5 py-2.5 bg-stone-50/80 hover:bg-stone-100 flex items-center justify-between text-xs font-semibold text-stone-700 transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <MapPin size={13} className="text-emerald-700" />
                <span>Додаткові відомості (місця, професія, хресні, нотатки)</span>
              </span>
              {showExtraDetails ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>

            {showExtraDetails && (
              <div className="p-3.5 space-y-3 bg-white border-t border-stone-200 animate-in fade-in-50 duration-150">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-medium text-stone-700 mb-0.5">Місце народження</label>
                    <input
                      type="text"
                      value={birthPlace}
                      onChange={(e) => setBirthPlace(e.target.value)}
                      placeholder="напр. с. Великі Дідушичі"
                      className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-stone-300 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-stone-700 mb-0.5">Місце проживання</label>
                    <input
                      type="text"
                      value={residencePlace}
                      onChange={(e) => setResidencePlace(e.target.value)}
                      placeholder="напр. м. Стрий"
                      className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-stone-300 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-stone-700 mb-0.5">Професія / Рід занять</label>
                    <input
                      type="text"
                      value={profession}
                      onChange={(e) => setProfession(e.target.value)}
                      placeholder="напр. Господар, тесляр, вчитель"
                      className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-stone-300 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-stone-700 mb-0.5">Хресні / Куми / Повитухи</label>
                    <input
                      type="text"
                      value={godparents}
                      onChange={(e) => setGodparents(e.target.value)}
                      placeholder="напр. Іван Коваль, Маріяна Слив'як"
                      className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-stone-300 bg-white"
                    />
                  </div>
                </div>

                {isDeceased && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-stone-200">
                    <div>
                      <label className="block text-[11px] font-medium text-stone-700 mb-0.5">Місце смерті</label>
                      <input
                        type="text"
                        value={deathPlace}
                        onChange={(e) => setDeathPlace(e.target.value)}
                        placeholder="Місце смерті"
                        className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-stone-300 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-stone-700 mb-0.5">Місце поховання</label>
                      <input
                        type="text"
                        value={burialPlace}
                        onChange={(e) => setBurialPlace(e.target.value)}
                        placeholder="напр. Стрілківське кладовище"
                        className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-stone-300 bg-white"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-medium text-stone-700 mb-0.5">Причина смерті</label>
                      <input
                        type="text"
                        value={deathCause}
                        onChange={(e) => setDeathCause(e.target.value)}
                        placeholder="напр. Природна старість, хвороба..."
                        className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-stone-300 bg-white"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-medium text-stone-700 mb-0.5">
                    Додаткові нотатки / Спогади
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Архівні витяги, сімейні перекази..."
                    className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-stone-300 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-600"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Footer Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-stone-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-stone-700 hover:bg-stone-100 rounded-lg transition-colors"
            >
              Скасувати
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg shadow-xs transition-colors"
            >
              Додати до дерева
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
