import React, { useEffect, useRef, useState } from "react";
import { VEHICLE_CATEGORIES } from "../../data/vehicleCategories";
import { VehicleCategory, VehicleCategoryId } from "../../types/navigation";
import { X, Check, ShieldAlert, Waves, Car, Bike, Info } from "lucide-react";

interface VehicleModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedVehicle: VehicleCategory;
  onSelectVehicle: (vehicle: VehicleCategory) => void;
}

export const VehicleModal: React.FC<VehicleModalProps> = ({
  isOpen,
  onClose,
  selectedVehicle,
  onSelectVehicle,
}) => {
  const [activeTab, setActiveTab] = useState<VehicleCategoryId>(
    selectedVehicle.id,
  );
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(selectedVehicle.id);
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>(
          "button:not(:disabled)",
        );
        if (!buttons?.length) return;
        const first = buttons[0],
          last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
        if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, [isOpen, selectedVehicle.id]);

  if (!isOpen) return null;

  const currentCategory =
    VEHICLE_CATEGORIES.find((v) => v.id === activeTab) || VEHICLE_CATEGORIES[0];

  const handleSelect = (category: VehicleCategory) => {
    onSelectVehicle(category);
    onClose();
  };

  const getVehicleIcon = (id: VehicleCategoryId) => {
    switch (id) {
      case "motorcycle":
      case "bicycle":
        return <Bike className="w-5 h-5" />;
      default:
        return <Car className="w-5 h-5" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="bg-slate-900 border border-slate-700 w-full max-w-4xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100"
        role="dialog"
        ref={dialog}
        aria-label="Vehicle simulation category"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Car className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                Pilia ang Kategorya sa Imong Sakyanan
              </h2>
              <p className="text-xs sm:text-sm text-slate-400">
                Vehicle Categories & Simulation Thresholds
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Category Pill Tabs */}
        <div className="flex overflow-x-auto gap-2 p-3 sm:px-6 bg-slate-950/60 border-b border-slate-800 scrollbar-thin">
          {VEHICLE_CATEGORIES.map((cat) => {
            const isCurrent = activeTab === cat.id;
            const isSelected = selectedVehicle.id === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveTab(cat.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all ${
                  isCurrent
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
                    : "bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                {getVehicleIcon(cat.id)}
                <span>{cat.title}</span>
                {isSelected && (
                  <span
                    className="w-2 h-2 rounded-full bg-emerald-400 ml-1"
                    title="Currently Selected"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Active Category Detailed View */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Main Info Card */}
          <div className="bg-slate-800/60 border border-slate-700/70 rounded-xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${currentCategory.badgeColor}`}
                >
                  {currentCategory.subtitle}
                </span>
                <span className="text-xs text-slate-400">
                  Clearance:{" "}
                  <strong className="text-slate-200">
                    {currentCategory.groundClearanceRange}
                  </strong>
                </span>
              </div>
              <h3 className="text-xl font-bold text-white mb-1">
                {currentCategory.title}
              </h3>
              <p className="text-sm text-slate-300 mb-2">
                {currentCategory.description}
              </p>

              {/* Cebuano Warning Notice */}
              <div className="flex items-start gap-2 text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5">
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>{currentCategory.warningNotice}</span>
              </div>
            </div>

            {/* Metric Box */}
            <div className="flex sm:flex-col items-center justify-center bg-slate-900/90 border border-slate-700 rounded-xl p-3 sm:px-6 sm:py-4 shrink-0 gap-3 sm:gap-1 text-center">
              <div className="flex items-center gap-1 text-sky-400">
                <Waves className="w-5 h-5" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  Simulated Water Limit
                </span>
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-sky-300">
                ≤ {currentCategory.maxSafeWaterDepthCm} cm
              </div>
              <div className="text-[11px] text-slate-400">Demo assumption</div>
            </div>
          </div>

          {/* Sample Models Included */}
          <div>
            <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
              <Info className="w-4 h-4 text-blue-400" />
              <span>
                Mga Pananglitan nga Modelo sa Sakyanan (Sample Models)
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {currentCategory.sampleModels.map((model, idx) => (
                <span
                  key={idx}
                  className="px-3 py-1.5 bg-slate-800 border border-slate-700/80 rounded-lg text-xs font-medium text-slate-200"
                >
                  {model}
                </span>
              ))}
            </div>
          </div>

          {/* Visual Sample Vehicle Images (Images of sample vehicles na pasok ana na category) */}
          <div>
            <h4 className="text-sm font-semibold text-slate-200 mb-3 flex items-center justify-between">
              <span>Sample Visual Vehicle References</span>
              <span className="text-xs text-slate-400 font-normal">
                I-match ang porma sa imong sakyanan
              </span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {currentCategory.sampleImages.map((img, idx) => (
                <div
                  key={idx}
                  className="group relative bg-slate-800/80 border border-slate-700/60 rounded-xl overflow-hidden hover:border-blue-500/60 transition-all shadow-md"
                >
                  <div className="h-36 sm:h-32 w-full overflow-hidden bg-slate-950">
                    <img
                      src={img.imageUrl}
                      alt={img.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  </div>
                  <div className="p-3 bg-slate-900/90 border-t border-slate-800">
                    <div className="text-xs font-bold text-white group-hover:text-blue-400 transition-colors">
                      {img.title}
                    </div>
                    <div className="text-[11px] text-slate-300">
                      {img.model}
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
                      <span>Clearance:</span>
                      <span className="font-semibold text-sky-400">
                        {img.clearance}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <div className="text-xs text-slate-400 hidden sm:block">
            Simulation threshold ra kini; dili garantiya nga luwas agian ang
            baha.
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 text-sm font-medium hover:bg-slate-800 transition-colors"
            >
              Kanselahon (Cancel)
            </button>
            <button
              onClick={() => handleSelect(currentCategory)}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold shadow-lg shadow-blue-600/30 transition-all"
            >
              <Check className="w-4 h-4" />
              <span>Gamita Kini (Select {currentCategory.title})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
